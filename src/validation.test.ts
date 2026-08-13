import { describe, expect, it } from 'vitest';
import { Validation } from './validation';

describe('test.is_string', () => {
	it('accepts a string and records no issues', () => {
		const validation = new Validation();
		expect(validation.test.is_string('hello', 'must be a string')).toBe(true);
		expect(validation.has()).toBe(false);
	});

	it.each([
		['undefined', undefined],
		['null', null],
		['a number', 42],
		['an object', {}],
		['an array', []]
	])('rejects %s and records the issue', (_label, value) => {
		const validation = new Validation();
		expect(validation.test.is_string(value, 'must be a string')).toBe(false);
		expect(validation.has()).toBe(true);
		expect(validation.first()?.message).toBe('must be a string');
	});

	it('passes when length is within bounds', () => {
		const validation = new Validation();
		const ok = validation.test.is_string('abc', 'must be a string', {
			length: { min: 1, max: 5, issue: 'wrong length' }
		});
		expect(ok).toBe(true);
		expect(validation.has()).toBe(false);
	});

	it('enforces a minimum length constraint', () => {
		const validation = new Validation();
		const ok = validation.test.is_string('ab', 'must be a string', {
			length: { min: 3, issue: 'too short' }
		});
		expect(ok).toBe(false);
		expect(validation.first()?.message).toBe('too short');
	});

	it('enforces a maximum length constraint', () => {
		const validation = new Validation();
		const ok = validation.test.is_string('abcdef', 'must be a string', {
			length: { max: 3, issue: 'too long' }
		});
		expect(ok).toBe(false);
		expect(validation.first()?.message).toBe('too long');
	});

	it('enforces a regexp match constraint', () => {
		const validation = new Validation();
		const ok = validation.test.is_string('abc123', 'must be a string', {
			match: { regexp: /^[a-z]+$/, issue: 'letters only' }
		});
		expect(ok).toBe(false);
		expect(validation.first()?.message).toBe('letters only');
	});

	it('enforces a list-of-values constraint', () => {
		const validation = new Validation();
		const ok = validation.test.is_string('purple', 'must be a string', {
			list: { values: ['red', 'green', 'blue'], issue: 'not an allowed color' }
		});
		expect(ok).toBe(false);
		expect(validation.first()?.message).toBe('not an allowed color');
	});

	it('merges issues from a custom validator', () => {
		const validation = new Validation();
		const ok = validation.test.is_string('anything', 'must be a string', {
			custom: {
				validate: () => new Validation().add('custom failure')
			}
		});
		expect(ok).toBe(false);
		expect(validation.first()?.message).toBe('custom failure');
	});
});

describe('test.has_string', () => {
	it('accepts an object with a matching string property', () => {
		const validation = new Validation();
		expect(validation.test.has_string({ name: 'Ada' }, 'name', 'name is required')).toBe(true);
		expect(validation.has()).toBe(false);
	});

	it('rejects an object whose property is the wrong type', () => {
		const validation = new Validation();
		expect(validation.test.has_string({ name: 42 }, 'name', 'name must be a string')).toBe(false);
		expect(validation.has()).toBe(true);
		expect(validation.first()?.message).toBe('name must be a string');
	});

	it('rejects an object missing the property entirely', () => {
		const validation = new Validation();
		expect(validation.test.has_string({}, 'name', 'name is required')).toBe(false);
		expect(validation.has()).toBe(true);
		expect(validation.first()?.message).toBe('name is required');
	});

	it('applies constraints to the property value', () => {
		const validation = new Validation();
		expect(
			validation.test.has_string({ name: 'A' }, 'name', 'name is required', {
				length: { min: 2, issue: 'name too short' }
			})
		).toBe(false);
		expect(validation.first()?.message).toBe('name too short');
	});
});

describe('shallow nested objects', () => {
	// Mirrors unmarshalling FormData into a nested shape: a flat object with one
	// property that is itself an object, validated with its own `Validation`
	// instance and merged into the parent at a base path.
	function validate_customer(input: unknown) {
		const validation = new Validation<{ name: string; label: string }>();
		const record = input as Record<string, unknown>;
		const data: { name?: string; label?: string } = {};
		if (validation.test.has_string(record, 'name', 'Customer name is required')) {
			data.name = record.name as string;
		}
		if (validation.test.has_string(record, 'label', 'Customer label is required')) {
			data.label = record.label as string;
		}
		return { validation, data };
	}

	function validate_workload(input: unknown) {
		type Out = { name: string; customer: { name: string; label: string } };
		const validation = new Validation<Out>();
		const record = input as Record<string, unknown>;
		const data: Partial<Out> = {};

		if (validation.test.has_string(record, 'name', 'Workload name is required')) {
			data.name = record.name as string;
		}

		const customer = validate_customer(record.customer);
		if (customer.validation.has()) {
			validation.merge(customer.validation, ['customer']);
		} else {
			data.customer = customer.data as Out['customer'];
		}

		return { validation, data };
	}

	it('validates a fully valid nested shape with no issues', () => {
		const { validation } = validate_workload({
			name: 'Workload 1',
			customer: { name: 'Acme', label: 'acme' }
		});
		expect(validation.has()).toBe(false);
	});

	it('records top-level and nested issues at their own paths', () => {
		const { validation } = validate_workload({
			customer: { label: 'acme' }
		});

		expect(validation.has()).toBe(true);
		expect(validation.has([])).toBe(true); // top-level 'name' issue
		expect(validation.has(['customer'])).toBe(true);

		const nested = validation.issues(['customer']);
		expect(nested).toHaveLength(1);
		expect(nested[0]?.message).toBe('Customer name is required');
	});

	it('reports every missing field across levels', () => {
		const { validation } = validate_workload({ customer: {} });
		expect(validation.length).toBe(3); // workload name, customer name, customer label
	});
});
