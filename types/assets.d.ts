/**
 * Non-code imports handled by the bundler.
 * Superseded by `vite/client` once dependencies are installed.
 */
declare module '*.css';
declare module '*.png' {
  const src: string;
  export default src;
}
declare module '*.svg' {
  const src: string;
  export default src;
}
