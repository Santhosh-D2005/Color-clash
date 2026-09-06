/**
 * Minimal ambient declarations for the React surface this client uses.
 *
 * Same rationale as node-minimal.d.ts: the repository typechecks with nothing
 * but Node and TypeScript. Running `npm install` in a networked environment
 * brings in `@types/react` and `@types/react-dom`, which supersede this file —
 * delete it and remove it from tsconfig `include` at that point.
 *
 * Intrinsic element props are intentionally permissive here; the real React
 * types tighten them.
 */

declare namespace React {
  type Key = string | number;
  type ReactNode =
    | ReactElement
    | string
    | number
    | boolean
    | null
    | undefined
    | Iterable<ReactNode>;

  interface ReactElement {
    type: unknown;
    props: unknown;
    key: Key | null;
  }

  type FC<P = Record<string, unknown>> = (props: P) => ReactElement | null;
  type Dispatch<A> = (value: A) => void;
  type SetStateAction<S> = S | ((prev: S) => S);
  type DependencyList = readonly unknown[];
  type EffectCallback = () => void | (() => void);

  interface MutableRefObject<T> {
    current: T;
  }

  interface CSSProperties {
    [key: string]: string | number | undefined;
  }

  interface ChangeEvent<T = Element> {
    target: T & { value: string; checked: boolean };
    currentTarget: T & { value: string; checked: boolean };
    preventDefault(): void;
  }

  interface FormEvent<T = Element> {
    target: T;
    currentTarget: T;
    preventDefault(): void;
  }

  interface MouseEvent<T = Element> {
    target: T;
    currentTarget: T;
    preventDefault(): void;
    stopPropagation(): void;
  }
}

declare module 'react' {
  export = React2;
}

declare namespace React2 {
  export import ReactNode = React.ReactNode;
  export import ReactElement = React.ReactElement;
  export import FC = React.FC;
  export import CSSProperties = React.CSSProperties;
  export import ChangeEvent = React.ChangeEvent;
  export import FormEvent = React.FormEvent;
  export import MouseEvent = React.MouseEvent;
  export import MutableRefObject = React.MutableRefObject;
  export import Dispatch = React.Dispatch;
  export import SetStateAction = React.SetStateAction;

  function useState<S>(initial: S | (() => S)): [S, React.Dispatch<React.SetStateAction<S>>];
  function useEffect(effect: React.EffectCallback, deps?: React.DependencyList): void;
  function useLayoutEffect(effect: React.EffectCallback, deps?: React.DependencyList): void;
  function useMemo<T>(factory: () => T, deps: React.DependencyList): T;
  function useCallback<T extends (...args: never[]) => unknown>(
    fn: T,
    deps: React.DependencyList,
  ): T;
  function useRef<T>(initial: T): React.MutableRefObject<T>;
  function createElement(type: unknown, props?: unknown, ...children: unknown[]): React.ReactElement;
  const StrictMode: React.FC<{ children?: React.ReactNode }>;
  const Fragment: React.FC<{ children?: React.ReactNode }>;
}

declare module 'react/jsx-runtime' {
  export function jsx(type: unknown, props: unknown, key?: React.Key): React.ReactElement;
  export function jsxs(type: unknown, props: unknown, key?: React.Key): React.ReactElement;
  export const Fragment: React.FC<{ children?: React.ReactNode }>;
}

declare module 'react/jsx-dev-runtime' {
  export function jsxDEV(type: unknown, props: unknown, key?: React.Key): React.ReactElement;
  export const Fragment: React.FC<{ children?: React.ReactNode }>;
}

declare module 'react-dom/client' {
  export function createRoot(container: Element | DocumentFragment): {
    render(node: React.ReactNode): void;
    unmount(): void;
  };
}

declare namespace JSX {
  type Element = React.ReactElement;
  interface ElementChildrenAttribute {
    children: Record<string, never>;
  }
  interface IntrinsicAttributes {
    key?: React.Key;
  }
  interface IntrinsicElements {
    [elemName: string]: Record<string, unknown> & {
      key?: React.Key;
      children?: React.ReactNode;
      className?: string;
      style?: React.CSSProperties;
    };
  }
}
