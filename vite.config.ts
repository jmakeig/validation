import { defineConfig } from 'vitest/config';
import dts from 'vite-plugin-dts';

export default defineConfig({
	build: {
		lib: {
			entry: 'src/validation.ts',
			formats: ['es'],
			fileName: 'index'
		}
	},
	plugins: [dts({ insertTypesEntry: true, exclude: ['**/*.test.ts'] })],
	test: {
		environment: 'node',
		coverage: {
			provider: 'v8',
			reporter: ['text', 'html']
		}
	}
});
