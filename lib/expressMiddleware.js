export default function expressMiddleware(options) {
	let settings = {
		...options,
	};

	return (req, res, next) => {
		return res.send('HELLO');
	};
}
