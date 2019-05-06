import * as hooks from '../../hooks';
import { VNode, PreactElement } from '../../src/internal';
import { Component, createContext, createRef, Fragment, ComponentChildren, ComponentChild } from '../../src';
import { FunctionalComponent } from 'preact';
import { ForwardFn } from './internal';

export { Component, createContext, createRef, Fragment } from '../../src';
export * from '../../hooks';

export const version: string;

export function createPortal (vnode: VNode, container: PreactElement): VNode<any>;

export function createElement (type: VNode["type"], props?: any, Children?: ComponentChildren): VNode<any>;

export function cloneElement (element: VNode<any>): VNode<any>;

export function render (vnode: VNode<any>, parent: PreactElement, callback?: () => void): Component | null;

export function unmountComponentAtNode (container: Element | Document | ShadowRoot | DocumentFragment): boolean;

export function createFactory (type: VNode["type"]): VNode<any>;

export function isValidElement (element: any): boolean;

export function findDOMNode (component: Component): PreactElement | null;

export interface PureComponent<P = {}, S = {}> extends Component {
  isPureReactComponenet: boolean;

  shouldComponentUpdate?(props: Readonly<P>, state: Readonly<S>): boolean;
}

export function memo (c: FunctionalComponent, comparer: (prev: any, next: any) => boolean): FunctionalComponent;

export function forwardRef (fn: ForwardFn): FunctionalComponent;

export function unstable_batchedUpdates (callback: () => void, arg?: any): void;

type mapFn = (children: ComponentChildren, fn: (d: any, i: number) => any) => Array<VNode | null> | null;

export interface Children {
  map: mapFn;
  forEach: mapFn;
  count: (children: ComponentChildren) => boolean;
  only: (children: ComponentChildren) => ComponentChild;
  toArray: (children: ComponentChildren) => VNode<{}>[];
}

export default {
  Children,
  hooks,
  version,
  createPortal,
  createElement,
  cloneElement,
  render,
  hydrate: render,
  unmountComponentAtNode,
  createContext,
  createFactory,
  createRef,
  Fragment,
  isValidElement,
  findDOMNode,
  Component,
  PureComponent,
  memo,
  forwardRef,
  unstable_batchedUpdates,
}
