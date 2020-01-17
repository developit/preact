import { EMPTY_OBJ, EMPTY_ARR } from './constants';
import { commitRoot, diff } from './diff/index';
import { createElement, Fragment } from './create-element';
import options from './options';
import { removeNode } from './util';

const IS_HYDRATE = EMPTY_OBJ;

/**
 * Render a Preact virtual node into a DOM element
 * @param {import('./index').ComponentChild} vnode The virtual node to render
 * @param {import('./internal').PreactElement} parentDom The DOM element to
 * render into
 * @param {Element | Text} [replaceNode] Attempt to re-use an
 * existing DOM tree rooted at `replaceNode`
 */
export function render(vnode, parentDom, replaceNode) {
	if (options._root) options._root(vnode, parentDom);

	let isHydrating = replaceNode === IS_HYDRATE;
	let oldVNode = isHydrating
		? null
		: (replaceNode && replaceNode._children) || parentDom._children;
	vnode = createElement(Fragment, null, [vnode]);

	const selectedDomRoot = isHydrating ? parentDom : replaceNode || parentDom;

	let commitQueue = [];
	diff(
		parentDom,
		(selectedDomRoot._children = vnode),
		oldVNode || EMPTY_OBJ,
		EMPTY_OBJ,
		parentDom.ownerSVGElement !== undefined,
		replaceNode && !isHydrating
			? [replaceNode]
			: oldVNode
			? null
			: EMPTY_ARR.slice.call(parentDom.childNodes),
		commitQueue,
		replaceNode || EMPTY_OBJ,
		isHydrating
	);
	commitRoot(commitQueue, vnode);

	if (!isHydrating && replaceNode && vnode._dom !== replaceNode)
		removeNode(replaceNode);
}

/**
 * Update an existing DOM element with data from a Preact virtual node
 * @param {import('./index').ComponentChild} vnode The virtual node to render
 * @param {import('./internal').PreactElement} parentDom The DOM element to
 * update
 */
export function hydrate(vnode, parentDom) {
	render(vnode, parentDom, IS_HYDRATE);
}
