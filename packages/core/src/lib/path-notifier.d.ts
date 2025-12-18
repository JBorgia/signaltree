export type PathNotifierInterceptor = (value: unknown, prev: unknown, path: string) => {
    block?: boolean;
    transform?: unknown;
};

export interface PathNotifier {
    subscribe(pattern: string, handler: (value: unknown, prev: unknown, path: string) => void): () => void;
    intercept(pattern: string, fn: PathNotifierInterceptor): () => void;
    notify(path: string, value: unknown, prev: unknown): void;
}

export function getPathNotifier(): PathNotifier;
