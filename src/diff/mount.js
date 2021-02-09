import { applyRef } from './refs';
import {
	COMPONENT_NODE,
	ELEMENT_NODE,
	MODE_HYDRATE,
	MODE_MUTATIVE_HYDRATE,
	MODE_NONE,
	MODE_SUSPENDED,
	TEXT_NODE
} from '../constants';
import { normalizeToVNode } from '../create-element';
import { setProperty } from './props';
import { renderComponent } from './component';
import { createInternal } from '../tree';
import options from '../options';
import { removeNode } from '../util';

/**
 * Diff two virtual nodes and apply proper changes to the DOM
 * @param {import('../internal').PreactElement} parentDom The parent of the DOM element
 * @param {import('../internal').Internal} internal The Internal node to mount
 * @param {object} globalContext The current context object. Modified by getChildContext
 * @param {boolean} isSvg Whether or not this element is an SVG node
 * @param {Array<import('../internal').Component>} commitQueue List of components
 * which have callbacks to invoke in commitRoot
 * @param {import('../internal').PreactElement} startDom
 * @returns {import('../internal').PreactElement | null} pointer to the next DOM node to be hydrated (or null)
 */
export function mount(
	parentDom,
	internal,
	globalContext,
	isSvg,
	commitQueue,
	startDom
) {
	if (options._diff) options._diff(internal);

	/** @type {import('../internal').PreactElement} */
	let nextDomSibling;

	try {
		if (internal._flags & COMPONENT_NODE) {
			nextDomSibling = renderComponent(
				parentDom,
				null,
				internal,
				globalContext,
				isSvg,
				commitQueue,
				startDom
			);
		} else {
			let hydrateDom =
				internal._mode & (MODE_HYDRATE | MODE_MUTATIVE_HYDRATE)
					? startDom
					: null;

			internal._dom = mountDOMElement(
				hydrateDom,
				internal,
				globalContext,
				isSvg,
				commitQueue
			);

			// @ts-ignore Trust me TS, nextSibling is a PreactElement
			nextDomSibling = internal._dom.nextSibling;
		}

		if (options.diffed) options.diffed(internal);

		// We successfully rendered this VNode, unset any stored hydration/bailout state:
		internal._mode = MODE_NONE;
	} catch (e) {
		internal._original = null;
		internal._mode = internal._mode | MODE_SUSPENDED;

		if (internal._mode & MODE_HYDRATE) {
			// @ts-ignore Trust me TS, nextSibling is a PreactElement
			nextDomSibling = startDom && startDom.nextSibling;
			internal._dom = startDom; // Save our current DOM position to resume later
		}
		options._catchError(e, internal, internal);
	}

	return nextDomSibling;
}

/**
 * Diff two virtual nodes representing DOM element
 * @param {import('../internal').PreactElement} dom The DOM element representing
 * the virtual nodes being diffed
 * @param {import('../internal').Internal} internal The Internal node to mount
 * @param {object} globalContext The current context object
 * @param {boolean} isSvg Whether or not this DOM node is an SVG node
 * @param {Array<import('../internal').Component>} commitQueue List of components
 * which have callbacks to invoke in commitRoot
 * @returns {import('../internal').PreactElement}
 */
function mountDOMElement(dom, internal, globalContext, isSvg, commitQueue) {
	let newProps = internal.props;
	let nodeType = internal.type;
	/** @type {any} */
	let i;

	let isHydrating = internal._mode & MODE_HYDRATE;

	// if hydrating (hydrate() or render() with replaceNode), find the matching child:
	if (internal._mode & (MODE_HYDRATE | MODE_MUTATIVE_HYDRATE)) {
		while (
			dom &&
			(nodeType ? dom.localName !== nodeType : dom.nodeType !== 3)
		) {
			dom = dom.nextSibling;
		}
	}

	if (internal._flags & TEXT_NODE) {
		if (dom == null) {
			// @ts-ignore createTextNode returns Text, we expect PreactElement
			dom = document.createTextNode(newProps);
		} else if (dom.data !== newProps) {
			dom.data = newProps;
		}
	} else {
		// Tracks entering and exiting SVG namespace when descending through the tree.
		if (nodeType === 'svg') isSvg = true;

		if (dom == null) {
			if (isSvg) {
				dom = document.createElementNS(
					'http://www.w3.org/2000/svg',
					// @ts-ignore We know `newVNode.type` is a string
					nodeType
				);
			} else {
				dom = document.createElement(
					// @ts-ignore We know `newVNode.type` is a string
					nodeType,
					newProps.is && newProps
				);
			}

			// we are creating a new node, so we can assume this is a new subtree (in case we are hydrating), this deopts the hydrate
			isHydrating = 0;
			internal._mode = MODE_NONE;
		}

		// @TODO: Consider removing and instructing users to instead set the desired
		// prop for removal to undefined/null. During hydration, props are not
		// diffed at all (including dangerouslySetInnerHTML)
		if (internal._mode & MODE_MUTATIVE_HYDRATE) {
			// But, if we are in a situation where we are using existing DOM (e.g. replaceNode)
			// we should read the existing DOM attributes to diff them
			for (i = 0; i < dom.attributes.length; i++) {
				const name = dom.attributes[i].name;
				if (!(name in newProps)) {
					dom.removeAttribute(name);
				}
			}
		}

		let newHtml, newValue, newChecked;
		for (i in newProps) {
			if (i === 'key' || i === 'children') {
			} else if (i === 'dangerouslySetInnerHTML') {
				newHtml = newProps[i];
			} else if (i === 'value') {
				newValue = newProps[i];
			} else if (i === 'checked') {
				newChecked = newProps[i];
			} else if (
				(!isHydrating || typeof newProps[i] == 'function') &&
				newProps[i] != null
			) {
				setProperty(dom, i, newProps[i], null, isSvg);
			}
		}

		// If the new vnode didn't have dangerouslySetInnerHTML, diff its children
		if (newHtml) {
			if (!isHydrating && newHtml.__html) {
				dom.innerHTML = newHtml.__html;
			}
			internal._children = [];
		} else if ((i = internal.props.children) != internal._children) {
			mountChildren(
				dom,
				Array.isArray(i) ? i : [i],
				internal,
				globalContext,
				isSvg && nodeType !== 'foreignObject',
				commitQueue,
				dom.firstChild
			);
		}

		// (as above, don't diff props during hydration)
		if (!isHydrating) {
			if (newValue != null) {
				setProperty(dom, 'value', newValue, null, false);
			}
			if (newChecked != null) {
				setProperty(dom, 'checked', newChecked, null, false);
			}
		}
	}

	return dom;
}

/**
 * Diff the children of a virtual node
 * @param {import('../internal').PreactElement} parentDom The DOM element whose
 * children are being diffed
 * @param {import('../internal').ComponentChildren[]} renderResult
 * @param {import('../internal').Internal} parentInternal The parent Internal of the given children
 * @param {object} globalContext The current context object - modified by getChildContext
 * @param {boolean} isSvg Whether or not this DOM node is an SVG node
 * @param {Array<import('../internal').Component>} commitQueue List of components
 * which have callbacks to invoke in commitRoot
 * @param {import('../internal').PreactElement} startDom
 */
export function mountChildren(
	parentDom,
	renderResult,
	parentInternal,
	globalContext,
	isSvg,
	commitQueue,
	startDom
) {
	let i, childVNode, childInternal, newDom, firstChildDom, mountedNextChild;

	parentInternal._children = [];
	for (i = 0; i < renderResult.length; i++) {
		childVNode = normalizeToVNode(renderResult[i]);

		// Terser removes the `continue` here and wraps the loop body
		// in a `if (childVNode) { ... } condition
		if (childVNode == null) {
			continue;
		}

		childInternal = createInternal(childVNode);
		parentInternal._children[i] = childInternal;

		childInternal._parent = parentInternal;
		childInternal._depth = parentInternal._depth + 1;
		childInternal._mode = parentInternal._mode;

		// Morph the old element into the new one, but don't append it to the dom yet
		mountedNextChild = mount(
			parentDom,
			childInternal,
			globalContext,
			isSvg,
			commitQueue,
			startDom
		);

		newDom = childInternal._dom;

		if (newDom != null) {
			if (firstChildDom == null) {
				firstChildDom = newDom;
			}

			if (childInternal._flags & COMPONENT_NODE || newDom == startDom) {
				// If the child is a Fragment-like or if it is DOM VNode and its _dom
				// property matches the dom we are diffing (i.e. startDom), just
				// continue with the mountedNextChild
				startDom = mountedNextChild;
			} else {
				// The DOM the diff should begin with is now startDom (since we inserted
				// newDom before startDom) so ignore mountedNextChild and continue with
				// startDom
				parentDom.insertBefore(newDom, startDom);
			}
		}

		if (childInternal.ref) {
			applyRef(
				childInternal.ref,
				childInternal._component || newDom,
				childInternal
			);
		}
	}

	parentInternal._dom = firstChildDom;

	// Remove children that are not part of any vnode.
	if (
		parentInternal._mode & (MODE_HYDRATE | MODE_MUTATIVE_HYDRATE) &&
		parentInternal._flags & ELEMENT_NODE
	) {
		// TODO: Would it be simpler to just clear the pre-existing DOM in top-level
		// render if render is called with no oldVNode & existing children & no
		// replaceNode? Instead of patching the DOM to match the VNode tree? (remove
		// attributes & unused DOM)
		while (startDom) {
			i = startDom;
			startDom = startDom.nextSibling;
			removeNode(i);
		}
	}

	return startDom;
}
