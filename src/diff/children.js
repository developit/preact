import { diff, unmount, applyRef } from './index';
import { coerceToVNode } from '../create-element';
import { EMPTY_OBJ, EMPTY_ARR } from '../constants';
import { removeNode } from '../util';
import { getDomSibling } from '../component';

/**
 * Diff the children of a virtual node
 * @param {import('../internal').PreactElement} parentDom The DOM element whose
 * children are being diffed
 * @param {import('../internal').VNode} newParentVNode The new virtual
 * node whose children should be diff'ed against oldParentVNode
 * @param {import('../internal').VNode} oldParentVNode The old virtual
 * node whose children should be diff'ed against newParentVNode
 * @param {object} context The current context object
 * @param {boolean} isSvg Whether or not this DOM node is an SVG node
 * @param {Array<import('../internal').PreactElement>} excessDomChildren
 * @param {Array<import('../internal').Component>} mounts The list of components
 * which have mounted
 * @param {Node | Text} oldDom The current attached DOM
 * element any new dom elements should be placed around. Likely `null` on first
 * render (except when hydrating). Can be a sibling DOM element when diffing
 * Fragments that have siblings. In most cases, it starts out as `oldChildren[0]._dom`.
 * @param {boolean} isHydrating Whether or not we are in hydration
 */
export function diffChildren(parentDom, newParentVNode, oldParentVNode, context, isSvg, excessDomChildren, mounts, oldDom, isHydrating) {
	let i, j, oldVNode, newDom, sibDom, firstChildDom, refs;

	// This is a compression of oldParentVNode!=null && oldParentVNode != EMPTY_OBJ && oldParentVNode._children || EMPTY_ARR
	// as EMPTY_OBJ._children should be `undefined`.
	//老节点的children
	let oldChildren = (oldParentVNode && oldParentVNode._children) || EMPTY_ARR;
	//老节点长度
	let oldChildrenLength = oldChildren.length;

	// Only in very specific places should this logic be invoked (top level `render` and `diffElementNodes`).
	// I'm using `EMPTY_OBJ` to signal when `diffChildren` is invoked in these situations. I can't use `null`
	// for this purpose, because `null` is a valid value for `oldDom` which can mean to skip to this logic
	// (e.g. if mounting a new tree in which the old DOM should be ignored (usually for Fragments).
	if (oldDom == EMPTY_OBJ) {
		if (excessDomChildren != null) {
			oldDom = excessDomChildren[0];
		}
		else if (oldChildrenLength) {
			oldDom = getDomSibling(oldParentVNode, 0);
		}
		else {
			oldDom = null;
		}
	}

	i=0;
	newParentVNode._children = toChildArray(newParentVNode._children, childVNode => {

		if (childVNode!=null) {
			//设置父虚拟节点
			childVNode._parent = newParentVNode;
			//处理深度
			childVNode._depth = newParentVNode._depth + 1;

			// Check if we find a corresponding element in oldChildren.
			// If found, delete the array item by setting to `undefined`.
			// We use `undefined`, as `null` is reserved for empty placeholders
			// (holes).
			oldVNode = oldChildren[i];
			//如果老节点为null或者 新老子节点的key和type相同 则设置老的节点为undefined 以便后面不执行unmount
			if (oldVNode===null || (oldVNode && childVNode.key == oldVNode.key && childVNode.type === oldVNode.type)) {
				oldChildren[i] = undefined;
			}
			else {
				// Either oldVNode === undefined or oldChildrenLength > 0,
				// so after this loop oldVNode == null or oldVNode is a valid value.
				//在老的子节点中循环 以便找到新老子节点向对应的，有相对应的就会复用这个节点而不会重新实例化一个新的节点
				for (j=0; j<oldChildrenLength; j++) {
					oldVNode = oldChildren[j];
					// If childVNode is unkeyed, we only match similarly unkeyed nodes, otherwise we match by key.
					// We always match by type (in either case).
					//同上
					if (oldVNode && childVNode.key == oldVNode.key && childVNode.type === oldVNode.type) {
						oldChildren[j] = undefined;
						break;
					}
					oldVNode = null;
				}
			}

			oldVNode = oldVNode || EMPTY_OBJ;

			// Morph the old element into the new one, but don't append it to the dom yet
			//对比子节点
			newDom = diff(parentDom, childVNode, oldVNode, context, isSvg, excessDomChildren, mounts, oldDom, isHydrating);
			//如果新子节点有ref并且不等于老子节点的ref，推到refs 等会会重新应用ref
			if ((j = childVNode.ref) && oldVNode.ref != j) {
				(refs || (refs=[])).push(j, childVNode._component || newDom, childVNode);
			}

			// Only proceed if the vnode has not been unmounted by `diff()` above.
			if (newDom!=null) {
				if (firstChildDom == null) {
					firstChildDom = newDom;
				}

				if (childVNode._lastDomChild != null) {
					// Only Fragments or components that return Fragment like VNodes will
					// have a non-null _lastDomChild. Continue the diff from the end of
					// this Fragment's DOM tree.
					newDom = childVNode._lastDomChild;

					// Eagerly cleanup _lastDomChild. We don't need to persist the value because
					// it is only used by `diffChildren` to determine where to resume the diff after
					// diffing Components and Fragments.
					childVNode._lastDomChild = null;
				}
				else if (excessDomChildren==oldVNode || newDom!=oldDom || newDom.parentNode==null) {
					// NOTE: excessDomChildren==oldVNode above:
					// This is a compression of excessDomChildren==null && oldVNode==null!
					// The values only have the same type when `null`.

					outer: if (oldDom==null || oldDom.parentNode!==parentDom) {
						parentDom.appendChild(newDom);
					}
					else {
						// `j<oldChildrenLength; j+=2` is an alternative to `j++<oldChildrenLength/2`
						for (sibDom=oldDom, j=0; (sibDom=sibDom.nextSibling) && j<oldChildrenLength; j+=2) {
							if (sibDom==newDom) {
								break outer;
							}
						}
						parentDom.insertBefore(newDom, oldDom);
					}

					// Browsers will infer an option's `value` from `textContent` when
					// no value is present. This essentially bypasses our code to set it
					// later in `diff()`. It works fine in all browsers except for IE11
					// where it breaks setting `select.value`. There it will be always set
					// to an empty string. Re-applying an options value will fix that, so
					// there are probably some internal data structures that aren't
					// updated properly.
					//
					// To fix it we make sure to reset the inferred value, so that our own
					// value check in `diff()` won't be skipped.
					if (newParentVNode.type == 'option') {
						parentDom.value = '';
					}
				}

				oldDom = newDom.nextSibling;

				if (typeof newParentVNode.type == 'function') {
					// At this point, if childVNode._lastDomChild existed, then
					// newDom = childVNode._lastDomChild per line 101. Else it is
					// the same as childVNode._dom, meaning this component returned
					// only a single DOM node
					newParentVNode._lastDomChild = newDom;
				}
			}
		}

		i++;
		return childVNode;
	});

	newParentVNode._dom = firstChildDom;

	// Remove children that are not part of any vnode.
	if (excessDomChildren!=null && typeof newParentVNode.type !== 'function') for (i=excessDomChildren.length; i--; ) if (excessDomChildren[i]!=null) removeNode(excessDomChildren[i]);

	// Remove remaining oldChildren if there are any.
	//循环卸载不使用的老虚拟节点
	for (i=oldChildrenLength; i--; ) if (oldChildren[i]!=null) unmount(oldChildren[i], oldChildren[i]);

	// Set refs only after unmount
	//循环应用refs
	if (refs) {
		for (i = 0; i < refs.length; i++) {
			applyRef(refs[i], refs[++i], refs[++i]);
		}
	}
}

/**
 * Flatten and loop through the children of a virtual node
 * @param {import('../index').ComponentChildren} children The unflattened
 * children of a virtual node
 * @param {(vnode: import('../internal').VNode) => import('../internal').VNode} [callback]
 * A function to invoke for each child before it is added to the flattened list.
 * @param {import('../internal').VNode[]} [flattened] An flat array of children to modify
 * @returns {import('../internal').VNode[]}
 */
//转换children为数组
export function toChildArray(children, callback, flattened) {
	//没有存在的就是空数组
	if (flattened == null) flattened = [];
	//为null或者是布尔类型
	if (children==null || typeof children === 'boolean') {
		if (callback) flattened.push(callback(null));
	}
	//如果children为数组则递归去添加
	else if (Array.isArray(children)) {
		for (let i=0; i < children.length; i++) {
			toChildArray(children[i], callback, flattened);
		}
	}
	else {
		//有回调则push回调返回的children，不然则是children
		flattened.push(callback ? callback(coerceToVNode(children)) : children);
	}

	return flattened;
}
