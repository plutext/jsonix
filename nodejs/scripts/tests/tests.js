process.on('uncaughtException', function(err) {
  console.error(err.stack);
});
module.exports = 
{

	"Jsonix": {
		"Util" : require('./util'),
		"XML" : require('./xml'),
		"Schema" : require('./schema'),
		"NodeJS" : require('./nodejs'),
		"SAX" : require('./sax'),
		"Issues" : require('./issues'),
		"TypeScript" : require('./typescript/typescript'),
		// Last: it binds port 8080 and aborts the run when the port is taken.
		"Request" : require('./request')
	}
};
