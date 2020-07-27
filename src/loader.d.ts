// loader.d.ts

declare module 'file-loader!*' {
    const url: string;
    export = url;
}
