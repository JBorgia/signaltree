export type PathNotifierInterceptor = (value: unknown, prev: unknown, path: string) => {
    block?: boolean;
    transform?: unknown;
};
