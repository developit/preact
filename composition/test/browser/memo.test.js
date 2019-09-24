import { createElement as h, render } from 'preact';
import { setupScratch, teardown } from '../../../test/_util/helpers';
import { createComponent, watch, unwrap, isReactive } from '../../src';

/** @jsx h */

describe('memo', () => {

	/** @type {HTMLDivElement} */
	let scratch;

	beforeEach(() => {
		scratch = setupScratch();
	});

	afterEach(() => {
		teardown(scratch);
	});

	it('only recomputes the result when inputs change', () => {
		let memoFunction = sinon.spy((a, b) => a + b);
		const results = [];

		const Comp = createComponent(({ a, b }) => {
			const result = watch([props => props.a, props => props.b], ([a, b]) =>
				memoFunction(a, b)
			);

			return () => {
				results.push(result.value);
				return null;
			};
		});

		render(<Comp a={1} b={1} />, scratch);
		render(<Comp a={1} b={1} />, scratch);

		expect(results).to.deep.equal([2, 2]);
		expect(memoFunction).to.have.been.calledOnce;

		render(<Comp a={1} b={2} />, scratch);
		render(<Comp a={1} b={2} />, scratch);

		expect(results).to.deep.equal([2, 2, 3, 3]);
		expect(memoFunction).to.have.been.calledTwice;
	});

	it('unwrap and check reactivity', () => {
		const Comp = createComponent(() => {
			const sum = watch(props => props.a + props.b);

			expect(unwrap(sum)).to.equal(3);
			expect(unwrap(sum)).to.equal(sum.value);
			expect(isReactive(sum)).to.be.true;
			expect(isReactive(sum.value)).to.be.false;
			expect(isReactive(null)).to.be.false;
			expect(isReactive(false)).to.be.false;

			return () => null;
		});

		render(<Comp a={1} b={2} />, scratch);
	});
});
