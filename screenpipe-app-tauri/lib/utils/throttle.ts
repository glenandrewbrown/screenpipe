/**
 * Lightweight throttle function — replaces lodash/throttle to avoid
 * pulling the entire lodash bundle (~70 KB).
 */
export function throttle<T extends (...args: any[]) => any>(
	fn: T,
	wait: number,
	options: { leading?: boolean; trailing?: boolean } = {},
): T & { cancel: () => void } {
	const { leading = true, trailing = true } = options;
	let timeoutId: ReturnType<typeof setTimeout> | null = null;
	let lastCallTime = 0;
	let lastArgs: Parameters<T> | null = null;

	let isFirstCall = true;

	const throttled = (...args: Parameters<T>) => {
		const now = Date.now();
		const remaining = wait - (now - lastCallTime);

		lastArgs = args;

		if (remaining <= 0 || remaining > wait) {
			if (timeoutId) {
				clearTimeout(timeoutId);
				timeoutId = null;
			}
			const shouldExecute = leading || !isFirstCall;
			lastCallTime = now;
			isFirstCall = false;
			if (shouldExecute) {
				fn(...args);
				lastArgs = null;
			}
		} else if (!timeoutId && trailing) {
			timeoutId = setTimeout(() => {
				lastCallTime = trailing ? Date.now() : 0;
				timeoutId = null;
				if (lastArgs) {
					fn(...lastArgs);
					lastArgs = null;
				}
			}, remaining);
		}
	};

	throttled.cancel = () => {
		if (timeoutId) {
			clearTimeout(timeoutId);
			timeoutId = null;
		}
		lastCallTime = 0;
		lastArgs = null;
		isFirstCall = true;
	};

	return throttled as T & { cancel: () => void };
}

/**
 * Lightweight debounce function — replaces lodash/debounce.
 */
export function debounce<T extends (...args: any[]) => any>(
	fn: T,
	wait: number,
): T & { cancel: () => void } {
	let timeoutId: ReturnType<typeof setTimeout> | null = null;

	const debounced = (...args: Parameters<T>) => {
		if (timeoutId) {
			clearTimeout(timeoutId);
		}
		timeoutId = setTimeout(() => {
			timeoutId = null;
			fn(...args);
		}, wait);
	};

	debounced.cancel = () => {
		if (timeoutId) {
			clearTimeout(timeoutId);
			timeoutId = null;
		}
	};

	return debounced as T & { cancel: () => void };
}
