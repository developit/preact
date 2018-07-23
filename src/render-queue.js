import options from './options';
import { defer } from './util';
import { renderComponent } from './vdom/component';

/**
 * @typedef {import('./component').Component} Component
 */

/**
 * Managed queue of dirty components to be re-rendered
 * @type {Array<Component>}
 */
let items = [];

/**
 * Enqueue a rerender of a component
 * @param {Component} component The component to rerender
 */
export function enqueueRender(component) {
	if (!component._dirty && (component._dirty = true) && items.push(component)==1) {
		(options.debounceRendering || defer)(rerender);
	}
}

/** Rerender all enqueued dirty components */
export function rerender() {
	let p, list = items;
	items = [];
	while ( (p = list.pop()) ) {
		if (p._dirty) renderComponent(p);
	}
}
