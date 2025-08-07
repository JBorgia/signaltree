import {
  signalTree,
  createFormTree,
} from './signal-tree/src/lib/signal-tree/signal-tree';

// Test basic SignalTree typing
interface TestUser {
  name: string;
  profile: {
    email: string;
    age: number;
  };
}

const userTree = signalTree<TestUser>({
  name: 'John',
  profile: {
    email: 'john@example.com',
    age: 30,
  },
});

// These should work but currently don't
const name = userTree.state.name(); // This should be accessible
const email = userTree.state.profile.email(); // This should be accessible

// Test FormTree typing
interface TestForm {
  username: string;
  email: string;
}

const formTree = createFormTree<TestForm>({
  username: '',
  email: '',
});

// These should work
const username = formTree.state.username(); // This should work
const formEmail = formTree.state.email(); // This should work
