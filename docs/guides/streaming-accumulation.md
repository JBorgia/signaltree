# Streaming and accumulation (LLM tokens, SSE, progressive results)

There is **no streaming marker**, and that is a decision rather than a gap. An
`asyncStream` marker existed in-repo, unexported, for several releases; it was
removed in 13.6.0. What it did is three lines of composition, and the
composition is easier to reason about than the marker was.

The reason it never shipped is worth stating: the API question — _a distinct
`asyncStream` marker, or an `accumulate` option on `asyncSource`?_ — was never
settled. Leaving 372 lines of one candidate sitting in the tree biased that
decision toward itself without anyone choosing. Git has it if the answer turns
out to be "marker".

---

## The problem

`asyncSource` and `asyncQuery` **replace** their value on each emission. That is
correct for a fetch and wrong for a stream: LLM tokens, SSE deltas and
progressive results need to **accumulate**.

```ts
// ❌ WRONG — each token replaces the last, so you see only the final chunk
reply: asyncSource({ load: () => streamTokens() });
```

---

## The pattern

A plain leaf plus a loop. The leaf is a `WritableSignal`, so `update()` is the
accumulator:

```ts
const chat = signalTree({
  reply: '',
  streaming: false,
});

async function ask(prompt: string) {
  chat.$.reply.set('');
  chat.$.streaming.set(true);
  try {
    for await (const chunk of llm.stream(prompt)) {
      chat.$.reply.update((text) => text + chunk);
    }
  } finally {
    chat.$.streaming.set(false);
  }
}
```

That is the whole thing. `chat.$.reply` is a signal, so templates track it,
`computed()` derives from it, and — because it is an ordinary leaf — it is
captured by `timeTravel()`, included in `tree()`, and persisted by
`persistence()` with no marker contract to satisfy.

### Cancellation

Hold the controller in a plain leaf too:

```ts
const chat = signalTree({
  reply: '',
  streaming: false,
  controller: null as AbortController | null,
});

async function ask(prompt: string) {
  chat.$.controller()?.abort();
  const controller = new AbortController();
  chat.$.controller.set(controller);
  chat.$.reply.set('');
  chat.$.streaming.set(true);
  try {
    for await (const chunk of llm.stream(prompt, {
      signal: controller.signal,
    })) {
      chat.$.reply.update((text) => text + chunk);
    }
  } catch (err) {
    if ((err as Error).name !== 'AbortError') throw err;
  } finally {
    chat.$.streaming.set(false);
  }
}

const stop = () => chat.$.controller()?.abort();
```

### A conversation, not one reply

Messages are a keyed collection, so they are an `entityMap`. The in-flight reply
stays a leaf until it is complete, then joins the collection:

```ts
const chat = signalTree({
  messages: entityMap<ChatMessage, string>({ selectId: (m) => m.id }),
  draft: '',
  streaming: false,
});

async function ask(prompt: string) {
  const id = crypto.randomUUID();
  chat.$.messages.addOne({ id, role: 'user', text: prompt });
  chat.$.draft.set('');
  chat.$.streaming.set(true);

  for await (const chunk of llm.stream(prompt)) {
    chat.$.draft.update((text) => text + chunk);
  }

  chat.$.messages.addOne({
    id: crypto.randomUUID(),
    role: 'assistant',
    text: chat.$.draft(),
  });
  chat.$.draft.set('');
  chat.$.streaming.set(false);
}
```

Accumulating into `draft` rather than into the collection matters: a per-token
`updateOne` would rewrite the message on every chunk, and an `entityMap` write
is O(1) but a token stream is thousands of them.

### Server-sent events

Identical shape — only the producer changes:

```ts
const feed = signalTree({ events: [] as FeedEvent[], connected: false });

const source = new EventSource('/api/feed');
source.onopen = () => feed.$.connected.set(true);
source.onerror = () => feed.$.connected.set(false);
source.onmessage = (e) => {
  feed.$.events.update((list) => [...list, JSON.parse(e.data)]);
};
```

⚠️ If that list is keyed and gets updated per item, it should be an `entityMap`
instead — core warns about exactly this shape (**ST2018**), because a growing
array leaf rebuilds and re-compares on every write.

---

## Why composition rather than a marker

**It participates in everything for free.** A leaf is captured by `timeTravel()`,
appears in `tree()`, persists, and needs no `snapshot`/`hydrate` declaration.
Every marker has to earn those individually — and the four bugs behind
[ST2022](../errors/README.md) were markers that never did.

**Accumulation is not one policy.** Concatenating strings, appending to a list,
merging partial objects and reducing to a running total are all "accumulate",
and a marker has to pick or grow an options bag. `update()` is the accumulator,
and it is already general.

**Streams are not restorable.** A half-received stream cannot be resumed from a
snapshot — the connection is gone. That is why the removed marker could capture
but never restore, which is a strange contract for a marker to have and a
perfectly ordinary one for a plain leaf.

---

## Related

- [ST2018](../errors/README.md) — a keyed collection modelled as an array leaf
- [ST2022](../errors/README.md) — a marker that never declared what of it is state
- [entity-collection-cookbook.md](./entity-collection-cookbook.md) — when a
  collection wants `entityMap`
