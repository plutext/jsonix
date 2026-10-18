// Strict mode. Bundlers emit the runtime inside an ES module, which is strict, so an assignment to an
// undeclared variable, an implicit global under Node's CommonJS, throws there: Base64Binary.decode's
// `input` did, on every o:gfxdata of a Word text box, and the Unmarshaller's `that` in unmarshalFile and
// unmarshalURL would have. Two guards: a static scan of all three copies of the runtime for assignments
// that resolve to no declaration, and the factory loaded as strict code to run what threw.
var fs = require('fs');
var path = require('path');
var ts = require('typescript');
var xmldom = require('@xmldom/xmldom');

var ROOT = path.resolve(__dirname, '..', '..', '..');

function javascriptFiles(dir) {
	return fs.readdirSync(dir).reduce(function(files, name) {
		var file = path.join(dir, name);
		if (fs.statSync(file).isDirectory()) {
			return files.concat(javascriptFiles(file));
		}
		return /\.js$/.test(name) ? files.concat([file]) : files;
	}, []);
}

var ASSIGNMENTS = [ts.SyntaxKind.EqualsToken, ts.SyntaxKind.PlusEqualsToken, ts.SyntaxKind.MinusEqualsToken,
	ts.SyntaxKind.AsteriskEqualsToken, ts.SyntaxKind.SlashEqualsToken, ts.SyntaxKind.PercentEqualsToken,
	ts.SyntaxKind.AmpersandEqualsToken, ts.SyntaxKind.BarEqualsToken, ts.SyntaxKind.CaretEqualsToken,
	ts.SyntaxKind.LessThanLessThanEqualsToken, ts.SyntaxKind.GreaterThanGreaterThanEqualsToken,
	ts.SyntaxKind.GreaterThanGreaterThanGreaterThanEqualsToken];

// Each file set is one program, so the modular sources resolve each other's top-level declarations as the
// concatenated bundle does. An assignment to a name that resolves to nothing, or only to a DOM or ES
// library global, is reported as file:line.
function undeclaredAssignments(files) {
	var program = ts.createProgram(files, { allowJs: true, noEmit: true, lib: ['lib.es2020.d.ts', 'lib.dom.d.ts'], types: [] });
	var checker = program.getTypeChecker();
	var findings = [];
	files.forEach(function(file) {
		var sourceFile = program.getSourceFile(file);
		function check(identifier) {
			var symbol = checker.getSymbolAtLocation(identifier);
			var declaration = symbol && symbol.declarations && symbol.declarations[0];
			if (!declaration || program.isSourceFileDefaultLibrary(declaration.getSourceFile())) {
				var line = sourceFile.getLineAndCharacterOfPosition(identifier.getStart()).line + 1;
				findings.push(path.relative(ROOT, file) + ':' + line + ': ' + identifier.text);
			}
		}
		function visit(node) {
			if (ts.isBinaryExpression(node) && ASSIGNMENTS.indexOf(node.operatorToken.kind) >= 0 && ts.isIdentifier(node.left)) {
				check(node.left);
			} else if ((ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) && ts.isIdentifier(node.operand) &&
					(node.operator === ts.SyntaxKind.PlusPlusToken || node.operator === ts.SyntaxKind.MinusMinusToken)) {
				check(node.operand);
			} else if ((ts.isForInStatement(node) || ts.isForOfStatement(node)) && ts.isIdentifier(node.initializer)) {
				check(node.initializer);
			}
			ts.forEachChild(node, visit);
		}
		visit(sourceFile);
	});
	return findings;
}

// The factory compiled with a "use strict" directive, which applies to every function inside it.
function strictFactory(source) {
	var module = { exports: {} };
	new Function('module', '"use strict";\n' + source)(module);
	return module.exports;
}

var NS = 'urn:vml';
var mapping = {
	name: 'strict',
	defaultElementNamespaceURI: NS,
	typeInfos: [
		{ localName: 'Shape', propertyInfos: [{ name: 'gfxdata', type: 'attribute', typeInfo: 'Base64Binary' }] },
		{ localName: 'Foo', propertyInfos: [{ name: 'bar', type: 'element', elementName: { localPart: 'bar' }, typeInfo: 'String' }] }
	],
	elementInfos: [
		{ elementName: 'shape', typeInfo: '.Shape' },
		{ elementName: { localPart: 'foo' }, typeInfo: '.Foo' }
	]
};

var Jsonix = strictFactory(fs.readFileSync(path.join(__dirname, '..', 'jsonix-factory.js'), 'utf8'))(xmldom, undefined, fs).Jsonix;

module.exports = {
	"NoUndeclaredAssignments": {
		"Node": function(test) {
			test.deepEqual([], undeclaredAssignments([path.join(ROOT, 'nodejs', 'scripts', 'jsonix-factory.js')]));
			test.done();
		},
		"Dist": function(test) {
			test.deepEqual([], undeclaredAssignments([path.join(ROOT, 'dist', 'Jsonix-all.js')]));
			test.done();
		},
		"Modular": function(test) {
			test.deepEqual([], undeclaredAssignments(javascriptFiles(path.join(ROOT, 'scripts', 'src', 'main', 'javascript'))));
			test.done();
		},
		"ScanReportsAnUndeclaredAssignment": function(test) {
			var file = path.join(require('os').tmpdir(), 'jsonix-strict-' + process.pid + '.js');
			fs.writeFileSync(file, 'function decode(text) {\n\tinput = text;\n\tvar output = input;\n\treturn output;\n}\n');
			try {
				test.deepEqual([path.relative(ROOT, file) + ':2: input'], undeclaredAssignments([file]));
			} finally {
				fs.unlinkSync(file);
			}
			test.done();
		}
	},
	"StrictFactory": {
		"IsStrict": function(test) {
			test.throws(function() { strictFactory('undeclaredStrictModeProbe = 1;'); }, ReferenceError);
			test.done();
		},
		"Base64BinaryAttribute": function(test) {
			var context = new Jsonix.Context([mapping]);
			var shape = context.createUnmarshaller().unmarshalString('<v:shape xmlns:v="' + NS + '" gfxdata="UEsDBBQA"/>');
			test.deepEqual([80, 75, 3, 4, 20, 0], shape.value.gfxdata);
			test.equal('<v:shape xmlns:v="' + NS + '" gfxdata="UEsDBBQA"/>',
				context.createMarshaller({ namespacePrefixes: { 'urn:vml': 'v' } }).marshalString(shape));
			test.done();
		},
		"UnmarshalFile": function(test) {
			var context = new Jsonix.Context([mapping]);
			context.createUnmarshaller().unmarshalFile(path.join(__dirname, 'test0.xml'), function(foo) {
				test.equal('foo', foo.name.localPart);
				test.equal('goo', foo.value.bar);
				test.done();
			});
		}
	}
};
