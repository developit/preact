import { h, h as createElement } from './h';
import { cloneElement } from './clone-element';
import { Component, Fragment } from './component';
import { render } from './render';
import { rerender } from './render-queue';
import options from './options';

function createRef() {
	return {};
}

export default {
	h,
	createElement,
	cloneElement,
	createRef,
	Component,
	Fragment,
	render,
	rerender,
	options
};

export {
	h,
	createElement,
	cloneElement,
	createRef,
	Component,
	Fragment,
	render,
	rerender,
	options
};
