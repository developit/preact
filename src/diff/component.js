import { mountChildren } from './mount';
import { diffChildren, reorderChildren } from './children';
import {
	DIRTY_BIT,
	FORCE_UPDATE,
	MODE_PENDING_ERROR,
	MODE_RERENDERING_ERROR
} from '../constants';
import { renderReactComponent } from './reactComponents';

/** @type {import('../internal').RendererState} */
export const rendererState = {
	context: {},
	skip: false,
	force: false,
	commit: false
};

/**
 * Diff two virtual nodes and apply proper changes to the DOM
 * @param {import('../internal').PreactElement} parentDom The parent of the DOM element
 * @param {import('../internal').VNode} newVNode The new virtual node
 * @param {import('../internal').Internal} internal The component's backing Internal node
 * @param {import('../internal').CommitQueue} commitQueue List of components
 * which have callbacks to invoke in commitRoot
 * @param {import('../internal').PreactNode} startDom
 * @returns {import('../internal').PreactNode} pointer to the next DOM node (in order) to be rendered (or null)
 */
export function renderComponent(
	parentDom,
	newVNode,
	internal,
	commitQueue,
	startDom
) {
	internal._flags &= ~DIRTY_BIT;
	if (internal._flags & MODE_PENDING_ERROR) {
		// Toggle the MODE_PENDING_ERROR and MODE_RERENDERING_ERROR flags. In
		// actuality, this should turn off the MODE_PENDING_ERROR flag and turn on
		// the MODE_RERENDERING_ERROR flag.
		internal._flags ^= MODE_PENDING_ERROR | MODE_RERENDERING_ERROR;
	}

	let prevContext = rendererState.context;
	rendererState.skip = false;
	rendererState.commit = false;
	rendererState.force = (internal._flags & FORCE_UPDATE) == FORCE_UPDATE;

	const renderResult = renderReactComponent(newVNode, internal, rendererState);

	internal.props = newVNode.props;
	let committed = rendererState.commit;
	if (prevContext != rendererState.context) {
		internal._context = rendererState.context;
	}

	let nextDomSibling;
	if (rendererState.skip) {
		// TODO: Returning undefined here (i.e. return;) passes all tests. That seems
		// like a bug. Should validate that we have test coverage for sCU that
		// returns Fragments with multiple DOM children
		nextDomSibling = reorderChildren(internal, startDom, parentDom);
	} else if (internal._children == null) {
		nextDomSibling = mountChildren(
			parentDom,
			Array.isArray(renderResult) ? renderResult : [renderResult],
			internal,
			commitQueue,
			startDom
		);
	} else {
		nextDomSibling = diffChildren(
			parentDom,
			Array.isArray(renderResult) ? renderResult : [renderResult],
			internal,
			commitQueue,
			startDom
		);
	}

	if (committed) {
		commitQueue.push(internal);
	}

	// In the event this subtree creates a new context for its children, restore
	// the previous context for its siblings
	rendererState.context = prevContext;

	return nextDomSibling;
}
