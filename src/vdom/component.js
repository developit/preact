import { SYNC_RENDER, DOM_RENDER, NO_RENDER, FORCE_RENDER, EMPTY_BASE } from '../constants';
import options from '../options';
import { isFunction, clone, extend, empty } from '../util';
import { hook, deepHook } from '../hooks';
import { enqueueRender } from '../render-queue';
import { getNodeProps } from '.';
import diff from './diff';
import { removeOrphanedChildren, recollectNodeTree } from './diff';
import { createComponent, collectComponent } from './component-recycler';
import { removeNode } from '../dom';


/** Mark component as dirty and queue up a render.
 *	@param {Component} component
 *	@private
 */
export function triggerComponentRender(component) {
	if (!component._dirty) {
		component._dirty = true;
		enqueueRender(component);
	}
}



/** Set a component's `props` (generally derived from JSX attributes).
 *	@param {Object} props
 *	@param {Object} [opts]
 *	@param {boolean} [opts.renderSync=false]	If `true` and {@link options.syncComponentUpdates} is `true`, triggers synchronous rendering.
 *	@param {boolean} [opts.render=true]			If `false`, no render will be triggered.
 */
export function setComponentProps(component, props, opts, context, mountAll) {
	let d = component._disableRendering===true;
	component._disableRendering = true;

	if ((component.__ref = props.ref)) delete props.ref;
	if ((component.__key = props.key)) delete props.key;

	if (!empty(component.base)) {
		hook(component, 'componentWillReceiveProps', props, context);
	}

	if (context && context!==component.context) {
		if (!component.prevContext) component.prevContext = component.context;
		component.context = context;
	}

	if (!component.prevProps) component.prevProps = component.props;
	component.props = props;

	component._disableRendering = d;

	if (opts!==NO_RENDER) {
		if (opts===SYNC_RENDER || options.syncComponentUpdates!==false) {
			renderComponent(component, SYNC_RENDER, mountAll);
		}
		else {
			triggerComponentRender(component);
		}
	}

	hook(component, '__ref', component);
}



/** Render a Component, triggering necessary lifecycle events and taking High-Order Components into account.
 *	@param {Component} component
 *	@param {Object} [opts]
 *	@param {boolean} [opts.build=false]		If `true`, component will build and store a DOM node if not already associated with one.
 *	@private
 */
export function renderComponent(component, opts, mountAll) {
	if (component._disableRendering) return;

	let skip, rendered,
		props = component.props,
		state = component.state,
		context = component.context,
		previousProps = component.prevProps || props,
		previousState = component.prevState || state,
		previousContext = component.prevContext || context,
		isUpdate = component.base,
		initialBase = isUpdate || component.nextBase;

	// if updating
	if (isUpdate) {
		component.props = previousProps;
		component.state = previousState;
		component.context = previousContext;
		if (opts!==FORCE_RENDER && hook(component, 'shouldComponentUpdate', props, state, context)===false) {
			skip = true;
		}
		else {
			hook(component, 'componentWillUpdate', props, state, context);
		}
		component.props = props;
		component.state = state;
		component.context = context;
	}

	component.prevProps = component.prevState = component.prevContext = component.nextBase = null;
	component._dirty = false;

	if (!skip) {
		rendered = hook(component, 'render', props, state, context);

		let childComponent = rendered && rendered.nodeName,
			toUnmount, base;

		// context to pass to the child, can be updated via (grand-)parent component
		if (component.getChildContext) {
			context = extend(clone(context), component.getChildContext());
		}

		if (isFunction(childComponent) && childComponent.prototype.render) {
			// set up high order component link

			let inst = component._component;
			let childRender = childComponent.prototype.render;
			if (inst && !(inst.constructor===childComponent || inst.render===childRender)) {
				toUnmount = inst;
				inst = null;
			}

			let childProps = getNodeProps(rendered);

			if (inst) {
				setComponentProps(inst, childProps, SYNC_RENDER, context);
			}
			else {
				inst = createComponent(childComponent, childProps, context);
				inst._parentComponent = component;
				component._component = inst;
				if (isUpdate) deepHook(inst, 'componentWillMount');
				setComponentProps(inst, childProps, NO_RENDER, context);
				renderComponent(inst, DOM_RENDER);
				if (isUpdate) deepHook(inst, 'componentDidMount');
			}

			base = inst.base;
		}
		else {
			let cbase = initialBase;

			// destroy high order component link
			toUnmount = component._component;
			if (toUnmount) {
				cbase = component._component = null;
			}

			if (initialBase || opts===DOM_RENDER) {
				if (cbase) cbase._component = null;
				base = diff(cbase, rendered || EMPTY_BASE, context, mountAll || !isUpdate);
			}
		}

		if (initialBase && base!==initialBase) {
			let p = initialBase.parentNode;
			if (p && base!==p) p.replaceChild(base, initialBase);
		}

		if (toUnmount) {
			unmountComponent(toUnmount, true);
		}

		component.base = base;
		if (base) {
			let componentRef = component,
				t = component;
			while ((t=t._parentComponent)) { componentRef = t; }
			base._component = componentRef;
			base._componentConstructor = componentRef.constructor;
		}

		if (isUpdate) {
			hook(component, 'componentDidUpdate', previousProps, previousState, previousContext);
		}
	}

	let cb = component._renderCallbacks, fn;
	if (cb) while ( (fn = cb.pop()) ) fn.call(component);

	return rendered;
}



/** Apply the Component referenced by a VNode to the DOM.
 *	@param {Element} dom	The DOM node to mutate
 *	@param {VNode} vnode	A Component-referencing VNode
 *	@returns {Element} dom	The created/mutated element
 *	@private
 */
export function buildComponentFromVNode(dom, vnode, context, mountAll) {
	let c = dom && dom._component,
		oldDom = dom;

	let isOwner = !mountAll && c && dom._componentConstructor===vnode.nodeName;
	while (c && !isOwner && (c=c._parentComponent)) {
		isOwner = c.constructor===vnode.nodeName;
	}

	if (isOwner) {
		setComponentProps(c, getNodeProps(vnode), SYNC_RENDER, context, mountAll);
		dom = c.base;
	}
	else {
		if (c) {
			unmountComponent(c, true);
			dom = oldDom = null;
		}
		dom = createComponentFromVNode(vnode, dom, context, mountAll);
		if (oldDom && dom!==oldDom) {
			oldDom._component = null;
			recollectNodeTree(oldDom);
		}
	}

	return dom;
}



/** Instantiate and render a Component, given a VNode whose nodeName is a constructor.
 *	@param {VNode} vnode
 *	@private
 */
function createComponentFromVNode(vnode, dom, context, mountAll) {
	let props = getNodeProps(vnode);
	let component = createComponent(vnode.nodeName, props, context);

	if (dom && !component.base) component.base = dom;

	setComponentProps(component, props, NO_RENDER, context);
	renderComponent(component, DOM_RENDER, mountAll);

	// let node = component.base;
	//if (!node._component) {
	//	node._component = component;
	//	node._componentConstructor = vnode.nodeName;
	//}

	return component.base;
}



/** Remove a component from the DOM and recycle it.
 *	@param {Element} dom			A DOM node from which to unmount the given Component
 *	@param {Component} component	The Component instance to unmount
 *	@private
 */
export function unmountComponent(component, remove) {
	// console.log(`${remove?'Removing':'Unmounting'} component: ${component.constructor.name}`, component);

	hook(component, '__ref', null);
	hook(component, 'componentWillUnmount');

	// recursively tear down & recollect high-order component children:
	let inner = component._component;
	if (inner) {
		unmountComponent(inner, remove);
		remove = false;
	}

	let base = component.base;
	if (base) {
		if (remove!==false) removeNode(base);
		removeOrphanedChildren(base.childNodes, true);
	}

	if (remove) {
		component._parentComponent = null;
		collectComponent(component);
	}

	hook(component, 'componentDidUnmount');
}
