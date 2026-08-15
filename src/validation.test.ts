import { describe, expect, it, vi } from 'vitest';
import { Validation, type Issue, type Validated } from './validation';

describe('test.is_object', () => {
	it('accepts a plain object and records no issues', () => {
		const validation = new Validation();
		expect(validation.test.is_object({}, 'must be an object')).toBe(true);
		expect(validation.has()).toBe(false);
	});

	it('accepts a null-prototype object', () => {
		const validation = new Validation();
		expect(validation.test.is_object(Object.create(null), 'must be an object')).toBe(true);
		expect(validation.has()).toBe(false);
	});

	it.each([
		['undefined', undefined],
		['null', null],
		['a number', 42],
		['a string', 'hello'],
		['a boolean', true],
		['an array', []],
		['a Date', new Date()],
		['a Map', new Map()],
		['a RegExp', /x/]
	])('rejects %s and records the issue', (_label, value) => {
		const validation = new Validation();
		expect(validation.test.is_object(value, 'must be an object')).toBe(false);
		expect(validation.has()).toBe(true);
		expect(validation.first()?.message).toBe('must be an object');
	});

	it('merges issues from a custom validator', () => {
		const validation = new Validation();
		const ok = validation.test.is_object({}, 'must be an object', {
			custom: {
				validate: () => new Validation().add('custom failure')
			}
		});
		expect(ok).toBe(false);
		expect(validation.first()?.message).toBe('custom failure');
	});
});

describe('test.has_object', () => {
	it('accepts an object with a matching object property', () => {
		const validation = new Validation();
		expect(
			validation.test.has_object({ customer: { name: 'Acme' } }, 'customer', 'customer is required')
		).toBe(true);
		expect(validation.has()).toBe(false);
	});

	it('rejects an object whose property is the wrong type', () => {
		const validation = new Validation();
		expect(
			validation.test.has_object({ customer: 'Acme' }, 'customer', 'customer must be an object')
		).toBe(false);
		expect(validation.has()).toBe(true);
		expect(validation.first()?.message).toBe('customer must be an object');
	});

	it('rejects an object missing the property entirely', () => {
		const validation = new Validation();
		expect(validation.test.has_object({}, 'customer', 'customer is required')).toBe(false);
		expect(validation.has()).toBe(true);
		expect(validation.first()?.message).toBe('customer is required');
	});

	it('records the property name as the issue path', () => {
		const validation = new Validation();
		validation.test.has_object({}, 'customer', 'customer is required');
		expect(validation.first()?.path).toEqual(['customer']);
	});

	it('merges issues from a custom validator, scoped under the property path', () => {
		const validation = new Validation();
		const ok = validation.test.has_object({ customer: {} }, 'customer', 'customer is required', {
			custom: {
				validate: () => new Validation().add('custom failure')
			}
		});
		expect(ok).toBe(false);
		expect(validation.issues(['customer'])).toHaveLength(1);
		expect(validation.first(['customer'])?.message).toBe('custom failure');
	});
});

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

	it('treats an unset length maximum as unbounded', () => {
		const validation = new Validation();
		const ok = validation.test.is_string('a fairly long string', 'must be a string', {
			length: { min: 1, issue: 'too short' }
		});
		expect(ok).toBe(true);
		expect(validation.has()).toBe(false);
	});

	it('defaults to UTF-16 code-unit length, over-counting astral characters', () => {
		const validation = new Validation();
		const ok = validation.test.is_string('😀', 'must be a string', {
			length: { max: 1, issue: 'too long' }
		});
		// A single emoji is one user-perceived character but two UTF-16 code units,
		// so the default counter reports it as exceeding max: 1.
		expect(ok).toBe(false);
		expect(validation.first()?.message).toBe('too long');
	});

	it('accepts a custom counter, e.g. a grapheme-aware one', () => {
		const validation = new Validation();
		const graphemes = (value: string) => [...new Intl.Segmenter().segment(value)].length;
		const ok = validation.test.is_string('😀', 'must be a string', {
			length: { max: 1, counter: graphemes, issue: 'too long' }
		});
		expect(ok).toBe(true);
		expect(validation.has()).toBe(false);
	});

	it('calls a custom counter exactly once per check', () => {
		const validation = new Validation();
		const counter = vi.fn((value: string) => value.length);
		validation.test.is_string('abc', 'must be a string', {
			length: { min: 1, max: 5, counter, issue: 'wrong length' }
		});
		expect(counter).toHaveBeenCalledTimes(1);
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

	it('records the property name as the issue path', () => {
		const validation = new Validation();
		validation.test.has_string({}, 'name', 'name is required');
		expect(validation.first()?.path).toEqual(['name']);

		validation.test.has_string({ name: 'A' }, 'name', 'name is required', {
			length: { min: 2, issue: 'name too short' }
		});
		expect(validation.issues(['name'])).toHaveLength(2);
	});
});

describe('test.is_number', () => {
	it('accepts a number and records no issues', () => {
		const validation = new Validation();
		expect(validation.test.is_number(42, 'must be a number')).toBe(true);
		expect(validation.has()).toBe(false);
	});

	it.each([
		['undefined', undefined],
		['null', null],
		['a string', '42'],
		['an object', {}],
		['NaN', NaN]
	])('rejects %s and records the issue', (_label, value) => {
		const validation = new Validation();
		expect(validation.test.is_number(value, 'must be a number')).toBe(false);
		expect(validation.has()).toBe(true);
		expect(validation.first()?.message).toBe('must be a number');
	});

	it('accepts negative numbers, zero, and floats', () => {
		const validation = new Validation();
		for (const value of [-1, 0, 3.14]) {
			expect(validation.test.is_number(value, 'must be a number')).toBe(true);
		}
		expect(validation.has()).toBe(false);
	});

	it('passes when the value is within range', () => {
		const validation = new Validation();
		const ok = validation.test.is_number(5, 'must be a number', {
			range: { min: 1, max: 10, issue: 'out of range' }
		});
		expect(ok).toBe(true);
		expect(validation.has()).toBe(false);
	});

	it('enforces a minimum range constraint', () => {
		const validation = new Validation();
		const ok = validation.test.is_number(0, 'must be a number', {
			range: { min: 1, issue: 'too small' }
		});
		expect(ok).toBe(false);
		expect(validation.first()?.message).toBe('too small');
	});

	it('enforces a maximum range constraint', () => {
		const validation = new Validation();
		const ok = validation.test.is_number(11, 'must be a number', {
			range: { max: 10, issue: 'too large' }
		});
		expect(ok).toBe(false);
		expect(validation.first()?.message).toBe('too large');
	});

	it('treats an unset range maximum as unbounded', () => {
		const validation = new Validation();
		const ok = validation.test.is_number(1_000_000, 'must be a number', {
			range: { min: 1, issue: 'too small' }
		});
		expect(ok).toBe(true);
		expect(validation.has()).toBe(false);
	});

	it('enforces a list-of-values constraint', () => {
		const validation = new Validation();
		const ok = validation.test.is_number(4, 'must be a number', {
			list: { values: [1, 2, 3], issue: 'not an allowed value' }
		});
		expect(ok).toBe(false);
		expect(validation.first()?.message).toBe('not an allowed value');
	});

	it('passes when the value is in the allowed list', () => {
		const validation = new Validation();
		const ok = validation.test.is_number(2, 'must be a number', {
			list: { values: [1, 2, 3], issue: 'not an allowed value' }
		});
		expect(ok).toBe(true);
		expect(validation.has()).toBe(false);
	});

	it('merges issues from a custom validator', () => {
		const validation = new Validation();
		const ok = validation.test.is_number(42, 'must be a number', {
			custom: {
				validate: () => new Validation().add('custom failure')
			}
		});
		expect(ok).toBe(false);
		expect(validation.first()?.message).toBe('custom failure');
	});
});

describe('test.has_number', () => {
	it('accepts an object with a matching number property', () => {
		const validation = new Validation();
		expect(validation.test.has_number({ size: 3 }, 'size', 'size is required')).toBe(true);
		expect(validation.has()).toBe(false);
	});

	it('rejects an object whose property is the wrong type', () => {
		const validation = new Validation();
		expect(validation.test.has_number({ size: '3' }, 'size', 'size must be a number')).toBe(false);
		expect(validation.has()).toBe(true);
		expect(validation.first()?.message).toBe('size must be a number');
	});

	it('rejects an object missing the property entirely', () => {
		const validation = new Validation();
		expect(validation.test.has_number({}, 'size', 'size is required')).toBe(false);
		expect(validation.has()).toBe(true);
		expect(validation.first()?.message).toBe('size is required');
	});

	it('applies constraints to the property value', () => {
		const validation = new Validation();
		expect(
			validation.test.has_number({ size: 0 }, 'size', 'size is required', {
				range: { min: 1, issue: 'size too small' }
			})
		).toBe(false);
		expect(validation.first()?.message).toBe('size too small');
	});

	it('records the property name as the issue path', () => {
		const validation = new Validation();
		validation.test.has_number({}, 'size', 'size is required');
		expect(validation.first()?.path).toEqual(['size']);
	});
});

describe('test.is_date', () => {
	it('accepts a Date and records no issues', () => {
		const validation = new Validation();
		expect(validation.test.is_date(new Date(), 'must be a date')).toBe(true);
		expect(validation.has()).toBe(false);
	});

	it.each([
		['undefined', undefined],
		['null', null],
		['a string', '2024-01-01'],
		['a number', Date.now()],
		['an object', {}],
		['an invalid Date', new Date(NaN)]
	])('rejects %s and records the issue', (_label, value) => {
		const validation = new Validation();
		expect(validation.test.is_date(value, 'must be a date')).toBe(false);
		expect(validation.has()).toBe(true);
		expect(validation.first()?.message).toBe('must be a date');
	});

	it('passes when the date is within range', () => {
		const validation = new Validation();
		const ok = validation.test.is_date(new Date('2024-06-01'), 'must be a date', {
			range: { min: new Date('2024-01-01'), max: new Date('2024-12-31'), issue: 'out of range' }
		});
		expect(ok).toBe(true);
		expect(validation.has()).toBe(false);
	});

	it('enforces a minimum range constraint', () => {
		const validation = new Validation();
		const ok = validation.test.is_date(new Date('2023-01-01'), 'must be a date', {
			range: { min: new Date('2024-01-01'), issue: 'too early' }
		});
		expect(ok).toBe(false);
		expect(validation.first()?.message).toBe('too early');
	});

	it('enforces a maximum range constraint', () => {
		const validation = new Validation();
		const ok = validation.test.is_date(new Date('2025-01-01'), 'must be a date', {
			range: { max: new Date('2024-12-31'), issue: 'too late' }
		});
		expect(ok).toBe(false);
		expect(validation.first()?.message).toBe('too late');
	});

	it('merges issues from a custom validator', () => {
		const validation = new Validation();
		const ok = validation.test.is_date(new Date(), 'must be a date', {
			custom: {
				validate: () => new Validation().add('custom failure')
			}
		});
		expect(ok).toBe(false);
		expect(validation.first()?.message).toBe('custom failure');
	});
});

describe('test.has_date', () => {
	it('accepts an object with a matching Date property', () => {
		const validation = new Validation();
		expect(
			validation.test.has_date({ created: new Date() }, 'created', 'created is required')
		).toBe(true);
		expect(validation.has()).toBe(false);
	});

	it('rejects an object whose property is the wrong type', () => {
		const validation = new Validation();
		expect(
			validation.test.has_date({ created: '2024-01-01' }, 'created', 'created must be a date')
		).toBe(false);
		expect(validation.has()).toBe(true);
		expect(validation.first()?.message).toBe('created must be a date');
	});

	it('rejects an object missing the property entirely', () => {
		const validation = new Validation();
		expect(validation.test.has_date({}, 'created', 'created is required')).toBe(false);
		expect(validation.has()).toBe(true);
		expect(validation.first()?.message).toBe('created is required');
	});

	it('applies constraints to the property value', () => {
		const validation = new Validation();
		expect(
			validation.test.has_date(
				{ created: new Date('2023-01-01') },
				'created',
				'created is required',
				{
					range: { min: new Date('2024-01-01'), issue: 'created too early' }
				}
			)
		).toBe(false);
		expect(validation.first()?.message).toBe('created too early');
	});

	it('records the property name as the issue path', () => {
		const validation = new Validation();
		validation.test.has_date({}, 'created', 'created is required');
		expect(validation.first()?.path).toEqual(['created']);
	});
});

describe('has_* against a null or undefined container', () => {
	// The type signature requires `T extends object`, but plain-JS callers get no
	// compile-time protection — a null/undefined container must record an issue,
	// not throw when the property is indexed.
	it.each([
		['null', null],
		['undefined', undefined]
	])('has_string does not throw when the container is %s', (_label, container) => {
		const validation = new Validation();
		expect(() =>
			validation.test.has_string(container as unknown as object, 'name', 'name is required')
		).not.toThrow();
		expect(validation.has()).toBe(true);
		expect(validation.first()?.message).toBe('name is required');
	});

	it.each([
		['null', null],
		['undefined', undefined]
	])('has_number does not throw when the container is %s', (_label, container) => {
		const validation = new Validation();
		expect(() =>
			validation.test.has_number(container as unknown as object, 'size', 'size is required')
		).not.toThrow();
		expect(validation.has()).toBe(true);
	});

	it.each([
		['null', null],
		['undefined', undefined]
	])('has_date does not throw when the container is %s', (_label, container) => {
		const validation = new Validation();
		expect(() =>
			validation.test.has_date(container as unknown as object, 'created', 'created is required')
		).not.toThrow();
		expect(validation.has()).toBe(true);
	});

	it.each([
		['null', null],
		['undefined', undefined]
	])('has_object does not throw when the container is %s', (_label, container) => {
		const validation = new Validation();
		expect(() =>
			validation.test.has_object(container as unknown as object, 'customer', 'customer is required')
		).not.toThrow();
		expect(validation.has()).toBe(true);
	});
});

describe('multiple constraints', () => {
	it('records one issue per failing constraint', () => {
		const validation = new Validation();
		const ok = validation.test.is_string('123', 'must be a string', {
			length: { min: 5, issue: 'too short' },
			match: { regexp: /^[a-z]+$/, issue: 'letters only' },
			list: { values: ['red', 'green', 'blue'], issue: 'not an allowed color' }
		});
		expect(ok).toBe(false);
		expect(validation.length).toBe(3);
		expect(validation.issues().map((issue) => issue.message)).toEqual([
			'too short',
			'letters only',
			'not an allowed color'
		]);
	});

	it('only records issues for the constraints that actually fail', () => {
		const validation = new Validation();
		const ok = validation.test.is_string('purple', 'must be a string', {
			length: { min: 3, max: 10, issue: 'wrong length' },
			match: { regexp: /^[a-z]+$/, issue: 'letters only' },
			list: { values: ['red', 'green', 'blue'], issue: 'not an allowed color' }
		});
		expect(ok).toBe(false);
		expect(validation.length).toBe(1);
		expect(validation.first()?.message).toBe('not an allowed color');
	});

	it('passes with zero issues when every constraint is satisfied', () => {
		const validation = new Validation();
		const ok = validation.test.is_string('red', 'must be a string', {
			length: { min: 1, max: 10, issue: 'wrong length' },
			match: { regexp: /^[a-z]+$/, issue: 'letters only' },
			list: { values: ['red', 'green', 'blue'], issue: 'not an allowed color' }
		});
		expect(ok).toBe(true);
		expect(validation.length).toBe(0);
	});

	it('combines a failing constraint with multiple issues from a custom validator', () => {
		const validation = new Validation();
		const ok = validation.test.is_string('123', 'must be a string', {
			length: { min: 5, issue: 'too short' },
			custom: {
				validate: () => new Validation().add('custom issue A', 'custom issue B')
			}
		});
		expect(ok).toBe(false);
		expect(validation.length).toBe(3);
	});

	it('has_string records one issue per failing constraint, all at the property path', () => {
		const validation = new Validation();
		const ok = validation.test.has_string({ name: '123' }, 'name', 'name is required', {
			length: { min: 5, issue: 'too short' },
			match: { regexp: /^[a-z]+$/, issue: 'letters only' }
		});
		expect(ok).toBe(false);
		expect(validation.issues(['name'])).toHaveLength(2);
	});

	it('is_number records one issue per failing constraint', () => {
		const validation = new Validation();
		const ok = validation.test.is_number(0, 'must be a number', {
			range: { min: 1, issue: 'too small' },
			list: { values: [2, 4, 6], issue: 'not an allowed value' }
		});
		expect(ok).toBe(false);
		expect(validation.length).toBe(2);
		expect(validation.issues().map((issue) => issue.message)).toEqual([
			'too small',
			'not an allowed value'
		]);
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
		expect(validation.has(['name'])).toBe(true); // top-level 'name' issue
		expect(validation.has(['customer', 'name'])).toBe(true);

		const nested = validation.issues(['customer', 'name']);
		expect(nested).toHaveLength(1);
		expect(nested[0]?.message).toBe('Customer name is required');
	});

	it('reports every missing field across levels', () => {
		const { validation } = validate_workload({ customer: {} });
		expect(validation.length).toBe(3); // workload name, customer name, customer label
	});
});

describe('add', () => {
	it('accepts a plain string message, defaulting to the root path', () => {
		const validation = new Validation();
		validation.add('a problem');
		expect(validation.first()).toEqual({ message: 'a problem', path: [] });
	});

	it('accepts a full Issue object, preserving its path and code', () => {
		const validation = new Validation();
		validation.add({ message: 'a problem', path: ['name'], code: 'required' });
		expect(validation.first()).toEqual({
			message: 'a problem',
			path: ['name'],
			code: 'required'
		});
	});

	it('accepts multiple issues, mixing strings and Issue objects, in one call', () => {
		const validation = new Validation();
		validation.add('first', { message: 'second', path: ['name'] });
		expect(validation.length).toBe(2);
		expect(validation.at(0)?.message).toBe('first');
		expect(validation.at(1)?.message).toBe('second');
	});
});

describe('at', () => {
	it('returns the issue at a given index', () => {
		const validation = new Validation();
		validation.add('first', 'second');
		expect(validation.at(0)?.message).toBe('first');
		expect(validation.at(1)?.message).toBe('second');
	});

	it('returns undefined for an out-of-bounds index', () => {
		const validation = new Validation();
		validation.add('only issue');
		expect(validation.at(5)).toBeUndefined();
	});
});

describe('filtering by code', () => {
	function setup(): Validation<unknown> {
		const validation = new Validation();
		validation.add(
			{ message: 'required', path: ['name'], code: 'required' },
			{ message: 'too short', path: ['name'], code: 'length' },
			{ message: 'required', path: ['label'], code: 'required' }
		);
		return validation;
	}

	it('has(path, code) matches only issues with that code at that path', () => {
		const validation = setup();
		expect(validation.has(['name'], 'required')).toBe(true);
		expect(validation.has(['name'], 'length')).toBe(true);
		expect(validation.has(['name'], 'unknown-code')).toBe(false);
	});

	it('issues(undefined, code) matches by code across all paths', () => {
		const validation = setup();
		expect(validation.issues(undefined, 'required')).toHaveLength(2);
	});

	it('coded(code) is shorthand for has(undefined, code)', () => {
		const validation = setup();
		expect(validation.coded('required')).toBe(true);
		expect(validation.coded('missing-code')).toBe(false);
	});

	it('first(path, code) returns the first matching issue', () => {
		const validation = setup();
		expect(validation.first(['name'], 'length')?.message).toBe('too short');
	});
});

describe('path filtering', () => {
	it('does not match a path of the same length but different segments', () => {
		const validation = new Validation();
		validation.add({ message: 'a', path: ['name'] });
		expect(validation.has(['label'])).toBe(false);
		expect(validation.has(['name'])).toBe(true);
	});

	it('does not match nested paths that share a prefix but diverge later', () => {
		const validation = new Validation();
		validation.add({ message: 'a', path: ['customer', 'name'] });
		expect(validation.has(['customer', 'label'])).toBe(false);
		expect(validation.has(['customer', 'name'])).toBe(true);
	});

	it('accepts a plain string as shorthand for a single-segment path', () => {
		const validation = new Validation();
		validation.add({ message: 'a', path: ['name'] });
		expect(validation.has('name')).toBe(true);
		expect(validation.issues('name')).toHaveLength(1);
		expect(validation.has('label')).toBe(false);
	});

	it('treats an empty string as the root path', () => {
		const validation = new Validation();
		validation.add('a'); // add() defaults string issues to path: []
		expect(validation.has('')).toBe(true);
	});
});

describe('issues without an explicit path', () => {
	// `path` is optional on `Issue`, so externally-constructed issues (e.g. from
	// hand-rolled JSON passed to `fromJSON`) may omit it entirely.
	it('merge() defaults a pathless issue to just the base_path', () => {
		const source = new Validation();
		source.add({ message: 'external issue' });

		const validation = new Validation();
		validation.merge(source, ['scope']);
		expect(validation.first()?.path).toEqual(['scope']);
	});

	it('toString() tolerates an issue with no path', () => {
		const validation = new Validation();
		validation.add({ message: 'no path issue' });
		expect(validation.toString()).toBe('no path issue ()\n(1)');
	});
});

describe('collect', () => {
	function validate_item(item: unknown): Validated<string> {
		const validation = new Validation<string>();
		if (validation.test.is_string(item, 'must be a string')) {
			return { data: item };
		}
		return { data: item, validation };
	}

	it('returns the validated output when every item is valid', () => {
		const validation = new Validation();
		const result = validation.collect(['a', 'b', 'c'], validate_item);
		expect(result).toEqual(['a', 'b', 'c']);
		expect(validation.has()).toBe(false);
	});

	it('returns a snapshot of the original items and records issues at an indexed path when items are invalid', () => {
		const validation = new Validation();
		const input = ['a', 42, 'c'];
		const result = validation.collect(input, validate_item);
		expect(result).toEqual(input);
		expect(validation.has()).toBe(true);
		expect(validation.issues([1])).toHaveLength(1);
		expect(validation.first([1])?.message).toBe('must be a string');
	});

	it('does not exhaust a one-shot Iterable, unlike returning the original reference would', () => {
		function* items(): Generator<unknown> {
			yield 'a';
			yield 42;
			yield 'c';
		}

		const validation = new Validation();
		const result = validation.collect(items(), validate_item);
		// If collect() had returned the original (spent) generator, a second read would come up empty.
		expect(Array.from(result)).toEqual(['a', 42, 'c']);
	});

	it('prefixes indexed issues with a base_path', () => {
		const validation = new Validation();
		validation.collect(['a', 42], validate_item, ['items']);
		expect(validation.issues(['items', 1])).toHaveLength(1);
	});

	it('accepts a typed collection with a validator that only trusts unknown', () => {
		// `In` (here, `{ sku: string }`) types the collection and the return value —
		// it never constrains what `validate` is willing to accept. `validate` re-checks
		// everything itself, the same way validate_ref/validate_workload do.
		const products: ReadonlyArray<{ sku: string }> = [{ sku: 'A' }, { sku: 'B' }];

		const validation = new Validation();
		const result = validation.collect(products, validate_item);

		// Every product fails `validate_item`'s "must be a string" check — the point here
		// isn't that they pass, it's that TypeScript allows pairing a typed collection with
		// an unknown-taking validator at all, and that collect() still behaves correctly.
		expect(validation.has()).toBe(true);
		expect(result).toEqual(products);
	});
});

describe('delegate', () => {
	function validate_item(item: unknown): Validated<string> {
		const validation = new Validation<string>();
		if (validation.test.is_string(item, 'must be a string')) {
			return { data: item };
		}
		return { data: item, validation };
	}

	it("returns validate's output when the value is valid", () => {
		const validation = new Validation();
		const result = validation.delegate({ name: 'Ada' }, 'name', validate_item);
		expect(result).toBe('Ada');
		expect(validation.has()).toBe(false);
	});

	it('returns the raw value and merges its issues at [key] when invalid', () => {
		const validation = new Validation();
		const result = validation.delegate({ name: 42 }, 'name', validate_item);
		expect(result).toBe(42);
		expect(validation.has()).toBe(true);
		expect(validation.issues(['name'])).toHaveLength(1);
		expect(validation.first(['name'])?.message).toBe('must be a string');
	});

	it('passes key through to validate, preserving its literal type', () => {
		const validation = new Validation();
		let received: string | undefined;
		validation.delegate({ name: 'Ada' }, 'name', (value, key) => {
			received = key;
			return { data: value };
		});
		expect(received).toBe('name');
	});

	it('does not require validate to trust the container’s declared type', () => {
		interface Person {
			name: unknown;
		}
		const person: Person = { name: 'Ada' };
		const validation = new Validation();
		// validate_item takes `unknown`, the same convention collect() enforces.
		const result = validation.delegate(person, 'name', validate_item);
		expect(result).toBe('Ada');
	});

	it('scopes issues from a nested validator under [key, ...]', () => {
		function validate_customer(input: unknown): Validated<{ name: string }> {
			const validation = new Validation<{ name: string }>();
			if (
				validation.test.is_object(input, 'must be an object') &&
				validation.test.has_string(input, 'name', 'name is required')
			) {
				return { data: { name: input.name } };
			}
			return { data: input, validation };
		}

		const validation = new Validation();
		validation.delegate({ customer: {} }, 'customer', validate_customer);
		expect(validation.issues(['customer', 'name'])).toHaveLength(1);
	});
});

describe('serialization', () => {
	it('toJSON returns the recorded issues', () => {
		const validation = new Validation();
		validation.add('first issue', { message: 'second issue', path: ['name'] });
		expect(validation.toJSON()).toEqual([
			{ message: 'first issue', path: [] },
			{ message: 'second issue', path: ['name'] }
		]);
	});

	it('JSON.stringify uses toJSON automatically', () => {
		const validation = new Validation();
		validation.add('an issue');
		expect(JSON.parse(JSON.stringify(validation))).toEqual([{ message: 'an issue', path: [] }]);
	});

	it('fromJSON rehydrates a Validation from a serialized issue list', () => {
		const validation = new Validation();
		validation.add('first issue', { message: 'second issue', path: ['name'] });
		const serialized = JSON.parse(JSON.stringify(validation));

		const rehydrated = Validation.fromJSON(serialized);
		expect(rehydrated.length).toBe(2);
		expect(rehydrated.issues(['name'])).toHaveLength(1);
	});

	it('fromJSON can be typed explicitly for the rehydrated Validation', () => {
		const rehydrated = Validation.fromJSON<{ name: string }>([{ message: 'x', path: [] }]);
		expect(rehydrated).toBeInstanceOf(Validation);
	});

	// A malformed payload here means the library's own serialized output is corrupt or was
	// never produced by this library at all — a programmer/integration bug, not a routine
	// validation failure, so `fromJSON` throws rather than returning a Validation whose
	// issues could be mistaken for real ones.
	it.each([
		['an object', { message: 'not an array' }],
		['a string', 'not an array'],
		['null', null],
		['undefined', undefined]
	])('fromJSON throws on a non-array top-level payload (%s)', (_label, json) => {
		expect(() => Validation.fromJSON(json)).toThrow(
			'Malformed validation JSON: expected an array of issues'
		);
	});

	it('fromJSON throws on the first malformed array element, identifying its index', () => {
		expect(() => Validation.fromJSON([{ message: 'ok' }, 42])).toThrow(
			/Malformed validation JSON at index 1/
		);
	});

	it('fromJSON throws when an element is missing a message', () => {
		expect(() => Validation.fromJSON([{ path: ['name'] }])).toThrow(
			/Malformed validation JSON at index 0/
		);
	});

	it('defaults a missing or malformed path/code on an otherwise valid element', () => {
		const validation = Validation.fromJSON([{ message: 'x', path: 'not-an-array', code: 42 }]);
		expect(validation.toJSON()).toEqual([{ message: 'x', path: [], code: undefined }]);
	});

	it('preserves a well-formed path and code', () => {
		const validation = Validation.fromJSON([{ message: 'x', path: ['name'], code: 'required' }]);
		expect(validation.toJSON()).toEqual([{ message: 'x', path: ['name'], code: 'required' }]);
	});
});

describe('fromJSON / toJSON round-trip', () => {
	// Goes through the full cycle a real caller would: serialize, cross a JSON boundary
	// (JSON.stringify/JSON.parse, as if sent over the wire or written to storage), then
	// rehydrate — and checks the result is identical to the original, not just "close enough".
	function roundtrip(validation: Validation<unknown>): readonly Issue[] {
		const serialized = JSON.parse(JSON.stringify(validation));
		return Validation.fromJSON(serialized).toJSON();
	}

	it('round-trips an empty Validation', () => {
		const validation = new Validation();
		expect(roundtrip(validation)).toEqual(validation.toJSON());
		expect(roundtrip(validation)).toEqual([]);
	});

	it('round-trips a single root-path issue', () => {
		const validation = new Validation();
		validation.add('a problem');
		expect(roundtrip(validation)).toEqual(validation.toJSON());
	});

	it('round-trips a nested-path issue', () => {
		const validation = new Validation();
		validation.add({ message: 'a problem', path: ['customer', 'name'] });
		expect(roundtrip(validation)).toEqual(validation.toJSON());
	});

	it('round-trips an issue with a code', () => {
		const validation = new Validation();
		validation.add({ message: 'a problem', path: ['name'], code: 'required' });
		expect(roundtrip(validation)).toEqual(validation.toJSON());
	});

	it('round-trips issues produced by merge() (e.g. from nested has_* validators)', () => {
		const validation = new Validation();
		validation.test.has_string({}, 'name', 'name is required');
		validation.test.has_number({ size: 'oops' }, 'size', 'size is required', {
			range: { min: 1, issue: 'too small' }
		});
		expect(roundtrip(validation)).toEqual(validation.toJSON());
	});

	it('round-trips multiple mixed issues in one Validation', () => {
		const validation = new Validation();
		validation.add(
			'root issue',
			{ message: 'coded issue', path: ['label'], code: 'required' },
			{ message: 'nested issue', path: ['customer', 'name'] }
		);
		expect(roundtrip(validation)).toEqual(validation.toJSON());
	});
});

describe('toString', () => {
	it('formats issues as a human-readable summary', () => {
		const validation = new Validation();
		validation.add('First problem', { message: 'Second problem', path: ['name'] });
		expect(validation.toString()).toBe('First problem ()\nSecond problem (name)\n(2)');
	});

	it('reports a count of zero when there are no issues', () => {
		const validation = new Validation();
		expect(validation.toString()).toBe('\n(0)');
	});

	it('does not throw when a path segment is a symbol', () => {
		const validation = new Validation();
		const tag = Symbol('tag');
		validation.add({ message: 'a problem', path: [tag] });
		expect(() => validation.toString()).not.toThrow();
		expect(validation.toString()).toContain('a problem (Symbol(tag))');
	});
});
