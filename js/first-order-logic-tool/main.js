"use strict";

(function () {
	var createElement = utils.createElement;
	var Context = parse.Context;
	var parseFormula = firstOrderLogicTool.parse;
	var analyze = firstOrderLogicTool.analyze;
	var AnalysisError = firstOrderLogicTool.AnalysisError;

	var form = document.forms["first-order-logic-tool"];
	var resultElement = document.getElementById("first-order-logic-tool-result");
	var truthTableResultElement = document.getElementById("first-order-logic-tool-truth-table-result");

	form.addEventListener("submit", function (event) {
		event.preventDefault();
	});

	form.formula.addEventListener("input", function () {
		var formula = form.formula.value;
		var selectionStart = Math.min(form.formula.selectionStart, form.formula.selectionEnd);
		var selectionEnd = Math.max(form.formula.selectionStart, form.formula.selectionEnd);
		var left = mathify(formula.substring(0, selectionStart));
		var middle = mathify(formula.substring(selectionStart, selectionEnd));
		var right = mathify(formula.substring(selectionEnd, formula.length));
		form.formula.value = left + middle + right;
		form.formula.setSelectionRange(left.length, left.length + middle.length);
	});

	form.formula.addEventListener("change", function () {
		var context = new Context(form.formula.value.normalize("NFC"));
		var formula = parseFormula(context);

		if (formula == null) {
			resultElement.style.display = "none";
			if (context.errorPosition === form.formula.value.length) {
				form.formula.value += " ";
			}
			form.formula.setSelectionRange(context.errorPosition, form.formula.value.length);
			form.error.value = context.error;
			form.error.style.removeProperty("display");
			return;
		}

		var infoMap;
		try {
			infoMap = analyze(formula);
		} catch (e) {
			if (!(e instanceof AnalysisError)) {
				throw e;
			}
			resultElement.style.display = "none";
			form.formula.setSelectionRange(e.source.start, e.source.end);
			form.error.value = e.message;
			form.error.style.removeProperty("display");
			return;
		}

		form.error.style.display = "none";

		var height = formula.height;
		var degree = formula.degree;

		form.interpretation.innerHTML = "";
		var interpretationListElement = document.createElement("ul");
		interpretationListElement.style.margin = "0";
		for (var identifier in infoMap) {
			interpretationListElement.appendChild(createElement("li", "“" + identifier + "” is a " + infoMap[identifier]));
		}
		form.interpretation.appendChild(interpretationListElement);

		form.parsed.innerHTML = "";
		form.parsed.appendChild(formula.accept(new FormulaToHTMLConverter(height)));

		form.height.value = height;
		form.degree.value = degree;

		if (degree === 0 || !formula.isPropositional) {
			truthTableResultElement.style.display = "none";
		} else {
			var terms = formula.accept(new PropositionalFormulaTermsCollector());
			var values = new Array(terms.length).fill(false);

			var table = document.createElement("table");
			var tr = document.createElement("tr");
			terms.forEach(function (term) {
				tr.appendChild(createElement("th", term));
			});
			tr.appendChild(createElement("th", formula));
			table.appendChild(tr);

			do {
				var result = formula.accept(new PropositionalFormulaEvaluator(terms, values));
				tr = document.createElement("tr");
				values.forEach(function (value) {
					tr.appendChild(createElement("td", value ? "𝕋" : "𝔽"));
				});
				tr.appendChild(createElement("td", result ? "𝕋" : "𝔽"));
				table.appendChild(tr);
			} while (nextBinary(values));

			form["truth-table"].innerHTML = "";
			form["truth-table"].appendChild(table);
			truthTableResultElement.style.removeProperty("display");
		}

		resultElement.style.removeProperty("display");
	});

	function mathify(string) {
		return string
			.replace(/&/g, "∧")
			.replace(/\|/g, "∨")
			.replace(/\^/g, "⊻")
			.replace(/[!~]/g, "¬")
			.replace(/<->/g, "↔")
			.replace(/->/g, "→")
			.replace(/<-([^>])/g, "←$1")
			.replace(/\\A/gi, "∀")
			.replace(/\\E/gi, "∃");
	}

	function nextBinary(booleanArray) {
		var length = booleanArray.length;
		for (var i = length - 1; i >= 0; i--) {
			if (!booleanArray[i]) {
				booleanArray[i] = true;
				for (var j = i + 1; j < length; j++) {
					booleanArray[j] = false;
				}
				return true;
			}
		}
		return false;
	}

	function FormulaToHTMLConverter(height) {
		var self = this;

		self.visitSymbol = function (symbol) {
			if (height > 1) {
				return document.createTextNode(symbol.identifier);
			} else {
				var box = createBox(1);
				box.innerText = symbol.identifier;
				return box;
			}
		};

		self.visitUnaryFormula = function (formula) {
			var operand = formula.operand;
			var height = formula.height;

			var box = createBox(height);
			box.appendChild(createText(height, formula.operator));

			if (operand.priority < formula.priority) {
				box.appendChild(document.createTextNode("("));
				box.appendChild(operand.accept(self));
				box.appendChild(document.createTextNode(")"));
			} else {
				box.appendChild(operand.accept(self));
			}

			return box;
		};

		self.visitBinaryFormula = function (formula) {
			var left = formula.left;
			var right = formula.right;
			var priority = formula.priority;
			var height = formula.height;

			var box = createBox(formula.height);

			if (left.isAssociative ? left.priority < priority : left.priority <= priority) {
				box.appendChild(document.createTextNode("("));
				box.appendChild(left.accept(self));
				box.appendChild(document.createTextNode(")"));
			} else {
				box.appendChild(left.accept(self));
			}

			box.appendChild(document.createTextNode(" "));
			box.appendChild(createText(height, formula.operator));
			box.appendChild(document.createTextNode(" "));

			if (right.priority <= priority) {
				box.appendChild(document.createTextNode("("));
				box.appendChild(right.accept(self));
				box.appendChild(document.createTextNode(")"));
			} else {
				box.appendChild(right.accept(self));
			}

			return box;
		};

		self.visitQuantifiedFormula = function (formula) {
			var height = formula.height;

			var box = createBox(height);
			box.appendChild(createText(height, formula.quantifier + formula.variable));

			if (formula.formula.priority < formula.priority) {
				box.appendChild(document.createTextNode("("));
				box.appendChild(formula.formula.accept(self));
				box.appendChild(document.createTextNode(")"));
			} else {
				box.appendChild(document.createTextNode(" "));
				box.appendChild(formula.formula.accept(self));
			}

			return box;
		};

		self.visitCall = function (call) {
			var args = call.args;
			var height = call.height;

			var box = createBox(height);
			box.appendChild(createText(height, call.identifier));
			box.appendChild(document.createTextNode("("));

			for (var i = 0, count = args.length; i < count; i++) {
				if (i > 0) {
					box.appendChild(document.createTextNode(", "));
				}
				box.appendChild(args[i].accept(self));
			}

			box.appendChild(document.createTextNode(")"));
			return box;
		};

		function createText(h, text) {
			var span = document.createElement("span");
			span.style.color = "hsl(" + ((height > 1 ? 360 / (height - 1) * (h - 1) : 0) + 210) + ", 100%, " + 100 / 3 + "%)";
			span.innerText = text;
			return span;
		}

		function createBox(h) {
			var box = document.createElement("div");
			box.className = "first-order-logic-tool-box";
			box.style.borderColor = "hsl(" + ((height > 1 ? 360 / (height - 1) * (h - 1) : 0) + 210) + ", 100%, 50%)";
			return box;
		}
	}

	function PropositionalFormulaTermsCollector() {
		var self = this;
		var terms = [];

		self.visitSymbol = function (symbol) {
			if (terms.indexOf(symbol.identifier) < 0) {
				terms.push(symbol.identifier);
			}
			return terms;
		};

		self.visitUnaryFormula = function (formula) {
			formula.operand.accept(self);
			return terms;
		};

		self.visitBinaryFormula = function (formula) {
			formula.left.accept(self);
			formula.right.accept(self);
			return terms;
		};
	}

	function PropositionalFormulaEvaluator(terms, values) {
		var self = this;

		self.visitSymbol = function (symbol) {
			return values[terms.indexOf(symbol.identifier)];
		};

		self.visitUnaryFormula = function (formula) {
			return !formula.operand.accept(self);
		};

		self.visitBinaryFormula = function (formula) {
			switch (formula.operator) {
				case "∧":
					return formula.left.accept(self) && formula.right.accept(self);
				case "∨":
					return formula.left.accept(self) || formula.right.accept(self);
				case "⊻":
					return formula.left.accept(self) !== formula.right.accept(self);
				case "→":
					return !formula.left.accept(self) || formula.right.accept(self);
				case "←":
					return formula.left.accept(self) || !formula.right.accept(self);
				case "↔":
					return formula.left.accept(self) === formula.right.accept(self);
			}
		};
	}
})();