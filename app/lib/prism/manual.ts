// Must run before Prism loads: stops it from highlighting the rest of wp-admin on its own.
( window as unknown as { Prism: { manual: boolean } } ).Prism = {
	manual: true,
};
export {};
