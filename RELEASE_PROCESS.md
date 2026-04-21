# Release Process

SignalTree releases require **signed git tags**. `scripts/release.sh` creates
the release tag with `git tag -s` and then runs `git tag -v` before `npm
publish`. If verification fails, the release is aborted and versions are rolled
back. An already-configured developer does not need to do anything special —
the script uses whatever signing key `git` is configured to use.

This document covers signing setup for developers cutting releases for the
first time.

## One-time GPG setup

1. Generate a key (skip if you already have one):

   ```sh
   gpg --full-generate-key
   # Choose RSA 4096 or Ed25519; set an expiration that fits your policy.
   ```

2. List keys and copy the long key ID:

   ```sh
   gpg --list-secret-keys --keyid-format=long
   ```

3. Make sure the key's UID email matches the email on your git commits
   (`git config user.email`). If not, add a UID or regenerate.

4. Tell git which key to use:

   ```sh
   git config --global user.signingkey <KEYID>
   # Optional: sign every commit (tags are signed by the release script either way)
   git config --global commit.gpgsign true
   ```

5. (Optional) Publish the public key to GitHub under Settings → SSH and GPG
   keys so GitHub marks your tags as "Verified":

   ```sh
   gpg --armor --export <KEYID>
   ```

## Alternative: SSH signing

If you'd rather sign with SSH (git 2.34+), use your existing SSH key instead of
GPG:

```sh
git config --global gpg.format ssh
git config --global user.signingkey ~/.ssh/id_ed25519.pub
# Optional:
git config --global commit.gpgsign true
```

For `git tag -v` to verify locally you also need an `allowed_signers` file:

```sh
mkdir -p ~/.config/git
echo "you@example.com $(cat ~/.ssh/id_ed25519.pub)" >> ~/.config/git/allowed_signers
git config --global gpg.ssh.allowedSignersFile ~/.config/git/allowed_signers
```

## Verify your setup locally

Before your first release, confirm end-to-end signing works. **Do this in a
throwaway repo**, not in `signaltree`:

```sh
cd /tmp && git init signing-check && cd signing-check
git commit --allow-empty -m "init"
git tag -s -m "test" test
git tag -v test        # must exit 0
git tag -d test
```

If `git tag -v test` exits 0, you're good. If it fails, re-check the config
above (especially that the signing key exists and the email matches).

## What the release script does

`scripts/release.sh`:

1. Creates `v<version>` with `git tag -s -m "Release v<version>"`.
2. Runs `git tag -v "v<version>"` — **this must exit 0**.
3. Only then proceeds to `npm publish` and pushes the tag.

If signing or verification fails, the script aborts before any package is
published and the existing rollback path restores package.json files and
deletes the local tag. An unsigned tag (or a tag signed by a key the system
can't verify) will never reach `npm publish`.
