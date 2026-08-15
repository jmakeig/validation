/// <reference lib="dom" />
import { describe, expect, it } from 'vitest';
import { Validation, type Validated } from './validation';

// Domain types and end-to-end flow extracted from the commented-out sketch that used to
// live at the bottom of validation.ts.

type Nullable<T> = T | null;

type Entity<Name extends string> = {
	readonly [P in Name]: string;
} & {
	label: string;
	name: string;
};
type Ref<Name extends string> = Entity<Name>;

type Customer = Entity<'customer'> & {
	region: Nullable<'Northam' | 'EMEA' | 'JAPAC' | 'Latam'>;
	segment: Nullable<'Select' | 'Enterprise' | 'Corporate' | 'SMB'>;
};

type Workload = Entity<'workload'> & {
	customer: Ref<'customer'>;
	size: number | null;
};

function validate_ref<Name extends string>(input: unknown, type: Name): Validated<Ref<Name>> {
	const validation = new Validation<Ref<Name>>();
	const output: Partial<Ref<Name>> = {};

	if (
		validation.test.is_object(input, `A '${type}' reference must exist`) &&
		validation.test.has_string(input, type, `A '${type}' reference must have an identity`)
	) {
		(output as Record<Name, string>)[type] = input[type];
	}

	if (validation.has()) {
		return { validation, data: input };
	}
	return { data: output as Ref<Name> };
}

function validate_workload(input: unknown, is_new: boolean = false): Validated<Workload> {
	const validation = new Validation<Workload>();
	const output: Partial<Workload> = {};

	if (validation.test.is_object(input, 'Workload must exist')) {
		// workload
		if (is_new) {
			if (input.workload) {
				// WARN: Oddball negation case
				validation.add({ message: 'A new workload cannot have an identity', path: ['workload'] });
			} else {
				// @ts-expect-error New instances must have a `null` identifier. This will be provided by the database.
				output.workload = null;
			}
		} else {
			if (
				validation.test.has_string(input, 'workload', 'An existing workload must have an identity')
			) {
				// @ts-expect-error Internal backdoor to set the partial’s identifier
				output.workload = input.workload;
			}
		}
		// name
		if (validation.test.has_string(input, 'name', 'Name is required')) {
			output.name = input.name.trim();
		}
		// label
		if (validation.test.has_string(input, 'label', 'Label is required')) {
			output.label = input.label.trim();
		}
		// customer
		if (validation.test.has_object(input, 'customer', 'A workload must have a customer')) {
			output.customer = validation.delegate(input, 'customer', (c, key) =>
				validate_ref(c, key)
			) as Ref<'customer'>;
		}
	}

	if (validation.has()) {
		return { data: input, validation };
	}
	return { data: output as Workload };
}

function unmarshall_workload(input: Record<string, unknown>): unknown {
	const pending: Record<string, unknown> = { ...input };
	if ('customer' in input) pending.customer = { customer: input.customer };
	return pending;
}

const api = {
	create_workload(input: unknown): Validated<Workload> {
		const workload = validate_workload(input, true);
		if (Validation.is_invalid(workload)) {
			return workload;
		}
		// This is all the stuff that the database will populate/re-hydrate
		// @ts-expect-error IDs are read-only from the consumer’s perspective
		workload.data.workload = 'NEW WORKLOAD';
		workload.data.customer.name = 'Acme Corp.';
		workload.data.customer.label = 'acme_corp';
		return workload;
	}
};

const workload_valid: Workload = {
	workload: '1',
	name: 'valid',
	label: 'valid',
	customer: {
		customer: 'A',
		name: 'A',
		label: 'a'
	},
	size: null
};

describe('validate_workload', () => {
	it('accepts a fully-formed workload', () => {
		expect(Validation.is_invalid(validate_workload(workload_valid))).toBe(false);
	});

	it('rejects an empty input', () => {
		expect(Validation.is_invalid(validate_workload({}))).toBe(true);
	});
});

describe('unmarshalling FormData', () => {
	function form_data(): FormData {
		const form = new FormData();
		form.set('name', 'Workload 1');
		form.set('label', 'workload_1');
		form.set('customer', '12345678');
		return form;
	}

	it('nests the flat "customer" field into a Ref-shaped object', () => {
		const unmarshalled = unmarshall_workload(Object.fromEntries(form_data())) as Record<
			string,
			unknown
		>;
		expect(unmarshalled.customer).toEqual({ customer: '12345678' });
	});

	it('creates a workload end-to-end from FormData', () => {
		const result = api.create_workload(unmarshall_workload(Object.fromEntries(form_data())));

		expect(Validation.is_invalid(result)).toBe(false);
		if (Validation.is_invalid(result)) return;
		expect(result.data).toMatchObject({
			workload: 'NEW WORKLOAD',
			name: 'Workload 1',
			label: 'workload_1',
			customer: { customer: '12345678', name: 'Acme Corp.', label: 'acme_corp' }
		});
	});
});
