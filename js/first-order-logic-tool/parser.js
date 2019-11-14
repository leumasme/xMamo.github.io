"use strict";

var firstOrderLogicTool = firstOrderLogicTool || {};

(function () {
	var firstStarting = utils.firstStarting;
	var Symbol = firstOrderLogicTool.Symbol;
	var UnaryFormula = firstOrderLogicTool.UnaryFormula;
	var BinaryFormula = firstOrderLogicTool.BinaryFormula;
	var QuantifiedFormula = firstOrderLogicTool.QuantifiedFormula;
	var Call = firstOrderLogicTool.Call;

	firstOrderLogicTool.parse = function (context) {
		var position = context.position;
		skipWhitespace(context);
		var formula = parseFormula(context);
		if (formula == null) {
			context.error = "Expected formula";
			context.position = position;
			return null;
		}
		skipWhitespace(context);
		if (!context.isAtEnd) {
			context.error = "Expected end of input";
			context.position = position;
			return null;
		}
		return formula;
	};

	function parseFormula(context) {
		var formula = parseImpliesOrEquivalenceFormula(context);
		if (formula == null) {
			context.error = "Expected formula";
			return null;
		}
		return formula;
	}

	function parseImpliesOrEquivalenceFormula(context) {
		var formula = parseAndOrXorOrOrFormula(context);
		if (formula == null) {
			context.error = "Expected ∧-formula, ∨-formula or higher priority formula";
			return null;
		}
		var position = context.position;
		skipWhitespace(context);
		var peek = firstStarting(context.peek(3), ["<->", "<-", "->", "→", "←", "↔"]);
		context.position = position;
		if (peek == null) {
			return formula;
		}
		var operator;
		switch (peek) {
			case "->":
			case "→":
				operator = "→";
				break;
			case "<-":
			case "←":
				operator = "←";
				break;
			case "<->":
			case "↔":
				operator = "↔";
				break;
		}
		while (true) {
			position = context.position;
			skipWhitespace(context);
			var advance;
			switch (operator) {
				case "→":
					advance = firstStarting(context.peek(2), ["->", "→"]);
					break;
				case "←":
					advance = firstStarting(context.peek(2), ["<-", "←"]);
					break;
				case "↔":
					advance = firstStarting(context.peek(3), ["<->", "↔"]);
					break;
			}
			if (advance == null) {
				context.position = position;
				break;
			}
			context.advance(advance.length);
			skipWhitespace(context);
			var right = parseAndOrXorOrOrFormula(context);
			if (right == null) {
				context.error = "Expected right operand";
				context.position = position;
				break;
			}
			formula = new BinaryFormula(formula, operator, right, context.source, formula.start, context.position);
			if (operator !== "↔") {
				break;
			}
		}
		return formula;
	}

	function parseAndOrXorOrOrFormula(context) {
		var formula = parseNotFormula(context);
		if (formula == null) {
			context.error = "Expected ¬-formula, ∀-formula, ∃-formula or higher priority formula";
			return null;
		}
		var position = context.position;
		skipWhitespace(context);
		var peek = context.peek(1);
		context.position = position;
		if (["&", "∧", "|", "∨"].indexOf(peek) < 0) {
			return formula;
		}
		var match;
		var operator;
		switch (peek) {
			case "&":
			case "∧":
				match = ["&", "∧"];
				operator = "∧";
				break;
			case "|":
			case "∨":
				match = ["|", "∨"];
				operator = "∨";
				break;
		}
		while (true) {
			position = context.position;
			skipWhitespace(context);
			if (match.indexOf(context.peek(1)) < 0) {
				context.position = position;
				break;
			}
			context.advance(1);
			skipWhitespace(context);
			var right = parseNotFormula(context);
			if (right == null) {
				context.error = "Expected right operand";
				context.position = position;
				break;
			}
			formula = new BinaryFormula(formula, operator, right, context.source, formula.start, context.position);
		}
		return formula;
	}

	function parseNotFormula(context) {
		if (["!", "~", "¬"].indexOf(context.peek(1)) < 0) {
			return parseQuantifiedFormula(context);
		}
		var position = context.position;
		context.advance(1);
		skipWhitespace(context);
		var operand = parseNotFormula(context);
		if (operand == null) {
			context.error = "Expected operand";
			context.position = position;
			return null;
		}
		return new UnaryFormula("¬", operand, context.source, position, context.position);
	}

	function parseQuantifiedFormula(context) {
		var peek = firstStarting(context.peek(2), ["\\A", "\\a", "\\E", "\\e", "∀", "∃"]);
		if (peek == null) {
			return parseParenthesizedFormula(context);
		}
		var position = context.position;
		context.advance(peek.length);
		var quantifier;
		switch (peek) {
			case "\\A":
			case "\\a":
			case "∀":
				quantifier = "∀";
				break;
			case "\\E":
			case "\\e":
			case "∃":
				quantifier = "∃";
				break;
		}
		skipWhitespace(context);
		var identifier = parseIdentifier(context);
		if (identifier == null) {
			context.error = "Expected variable";
			context.position = position;
			return null;
		}
		skipWhitespace(context);
		var formula = parseNotFormula(context);
		if (formula == null) {
			context.error = "Expected ¬-formula or higher priority formula";
			context.position = position;
			return null;
		}
		return new QuantifiedFormula(quantifier, identifier, formula, context.source, position, context.position);
	}

	function parseParenthesizedFormula(context) {
		if (context.peek(1) !== "(") {
			return parseCall(context);
		}
		var position = context.position;
		context.advance(1);
		skipWhitespace(context);
		var formula = parseFormula(context);
		if (formula == null) {
			context.error = "Expected formula";
			context.position = position;
			return parseCall(context);
		}
		skipWhitespace(context);
		if (context.peek(1) !== ")") {
			context.error = "Expected closing parenthesis";
			context.position = position;
			return parseCall(context);
		}
		context.advance(1);
		return formula;
	}

	function parseCall(context) {
		var initialPosition = context.position;
		var identifier = parseIdentifier(context);
		if (identifier == null) {
			context.error = "Expected constant or variable";
			return null;
		}
		var position = context.position;
		skipWhitespace(context);
		if (context.peek(1) !== "(") {
			context.position = position;
			return new Symbol(identifier, context.source, initialPosition, position);
		}
		context.advance(1);
		skipWhitespace(context);
		var args = [];
		var arg = parseFormula(context);
		if (arg != null) {
			args.push(arg);
			skipWhitespace(context);
			while (context.peek(1) === ",") {
				context.advance(1);
				skipWhitespace(context);
				arg = parseFormula(context);
				if (arg == null) {
					context.error = "Expected formula";
					context.position = position;
					return new Symbol(identifier, context.source, initialPosition, position);
				}
				args.push(arg);
				skipWhitespace(context);
			}
		}
		if (context.peek(1) !== ")") {
			context.error = "Expected closing parenthesis";
			context.position = position;
			return new Symbol(identifier, context.source, initialPosition, position);
		}
		context.advance(1);
		return new Call(identifier, args, context.source, initialPosition, context.position);
	}

	function parseIdentifier(context) {
		if (!/[A-Z_a-zªµºÀ-ÖØ-öø-ˁˆ-ˑˠ-ˤˬˮͰ-ʹͶͷͺ-ͽͿΆΈ-ΊΌΎ-ΡΣ-ϵϷ-ҁҊ-ԯԱ-Ֆՙՠ-ֈא-תׯ-ײؠ-يٮٯٱ-ۓەۥۦۮۯۺ-ۼۿܐܒ-ܯݍ-ޥޱߊ-ߪߴߵߺࠀ-ࠕࠚࠤࠨࡀ-ࡘࡠ-ࡪࢠ-ࢴࢶ-ࢽऄ-हऽॐक़-ॡॱ-ঀঅ-ঌএঐও-নপ-রলশ-হঽৎড়ঢ়য়-ৡৰৱৼਅ-ਊਏਐਓ-ਨਪ-ਰਲਲ਼ਵਸ਼ਸਹਖ਼-ੜਫ਼ੲ-ੴઅ-ઍએ-ઑઓ-નપ-રલળવ-હઽૐૠૡૹଅ-ଌଏଐଓ-ନପ-ରଲଳଵ-ହଽଡ଼ଢ଼ୟ-ୡୱஃஅ-ஊஎ-ஐஒ-கஙசஜஞடணதந-பம-ஹௐఅ-ఌఎ-ఐఒ-నప-హఽౘ-ౚౠౡಀಅ-ಌಎ-ಐಒ-ನಪ-ಳವ-ಹಽೞೠೡೱೲഅ-ഌഎ-ഐഒ-ഺഽൎൔ-ൖൟ-ൡൺ-ൿඅ-ඖක-නඳ-රලව-ෆก-ะาำเ-ๆກຂຄຆ-ຊຌ-ຣລວ-ະາຳຽເ-ໄໆໜ-ໟༀཀ-ཇཉ-ཬྈ-ྌက-ဪဿၐ-ၕၚ-ၝၡၥၦၮ-ၰၵ-ႁႎႠ-ჅჇჍა-ჺჼ-ቈቊ-ቍቐ-ቖቘቚ-ቝበ-ኈኊ-ኍነ-ኰኲ-ኵኸ-ኾዀዂ-ዅወ-ዖዘ-ጐጒ-ጕጘ-ፚᎀ-ᎏᎠ-Ᏽᏸ-ᏽᐁ-ᙬᙯ-ᙿᚁ-ᚚᚠ-ᛪᛱ-ᛸᜀ-ᜌᜎ-ᜑᜠ-ᜱᝀ-ᝑᝠ-ᝬᝮ-ᝰក-ឳៗៜᠠ-ᡸᢀ-ᢄᢇ-ᢨᢪᢰ-ᣵᤀ-ᤞᥐ-ᥭᥰ-ᥴᦀ-ᦫᦰ-ᧉᨀ-ᨖᨠ-ᩔᪧᬅ-ᬳᭅ-ᭋᮃ-ᮠᮮᮯᮺ-ᯥᰀ-ᰣᱍ-ᱏᱚ-ᱽᲀ-ᲈᲐ-ᲺᲽ-Ჿᳩ-ᳬᳮ-ᳳᳵᳶᳺᴀ-ᶿḀ-ἕἘ-Ἕἠ-ὅὈ-Ὅὐ-ὗὙὛὝὟ-ώᾀ-ᾴᾶ-ᾼιῂ-ῄῆ-ῌῐ-ΐῖ-Ίῠ-Ῥῲ-ῴῶ-ῼ‿⁀⁔ⁱⁿₐ-ₜℂℇℊ-ℓℕℙ-ℝℤΩℨK-ℭℯ-ℹℼ-ℿⅅ-ⅉⅎↃↄⰀ-Ⱞⰰ-ⱞⱠ-ⳤⳫ-ⳮⳲⳳⴀ-ⴥⴧⴭⴰ-ⵧⵯⶀ-ⶖⶠ-ⶦⶨ-ⶮⶰ-ⶶⶸ-ⶾⷀ-ⷆⷈ-ⷎⷐ-ⷖⷘ-ⷞⸯ々〆〱-〵〻〼ぁ-ゖゝ-ゟァ-ヺー-ヿㄅ-ㄯㄱ-ㆎㆠ-ㆺㇰ-ㇿ㐀-䶵一-鿯ꀀ-ꒌꓐ-ꓽꔀ-ꘌꘐ-ꘟꘪꘫꙀ-ꙮꙿ-ꚝꚠ-ꛥꜗ-ꜟꜢ-ꞈꞋ-ꞿꟂ-Ᶎꟷ-ꠁꠃ-ꠅꠇ-ꠊꠌ-ꠢꡀ-ꡳꢂ-ꢳꣲ-ꣷꣻꣽꣾꤊ-ꤥꤰ-ꥆꥠ-ꥼꦄ-ꦲꧏꧠ-ꧤꧦ-ꧯꧺ-ꧾꨀ-ꨨꩀ-ꩂꩄ-ꩋꩠ-ꩶꩺꩾ-ꪯꪱꪵꪶꪹ-ꪽꫀꫂꫛ-ꫝꫠ-ꫪꫲ-ꫴꬁ-ꬆꬉ-ꬎꬑ-ꬖꬠ-ꬦꬨ-ꬮꬰ-ꭚꭜ-ꭧꭰ-ꯢ가-힣ힰ-ퟆퟋ-ퟻ豈-舘並-龎ﬀ-ﬆﬓ-ﬗיִײַ-ﬨשׁ-זּטּ-לּמּנּסּףּפּצּ-ﮱﯓ-ﴽﵐ-ﶏﶒ-ﷇﷰ-ﷻ︳︴﹍-﹏ﹰ-ﹴﹶ-ﻼＡ-Ｚ＿ａ-ｚｦ-ﾾￂ-ￇￊ-ￏￒ-ￗￚ-ￜ]/.test(context.peek(1))) {
			context.error = "Expected identifier";
			return null;
		}
		var position = context.position;
		do {
			context.advance(1);
		} while (/[0-9A-Z_a-zªµºÀ-ÖØ-öø-ˁˆ-ˑˠ-ˤˬˮ̀-ʹͶͷͺ-ͽͿΆΈ-ΊΌΎ-ΡΣ-ϵϷ-ҁ҃-҇Ҋ-ԯԱ-Ֆՙՠ-ֈ֑-ׇֽֿׁׂׅׄא-תׯ-ײؐ-ؚؠ-٩ٮ-ۓە-ۜ۟-۪ۨ-ۼۿܐ-݊ݍ-ޱ߀-ߵߺ߽ࠀ-࠭ࡀ-࡛ࡠ-ࡪࢠ-ࢴࢶ-ࢽ࣓-ࣣ࣡-ॣ०-९ॱ-ঃঅ-ঌএঐও-নপ-রলশ-হ়-ৄেৈো-ৎৗড়ঢ়য়-ৣ০-ৱৼ৾ਁ-ਃਅ-ਊਏਐਓ-ਨਪ-ਰਲਲ਼ਵਸ਼ਸਹ਼ਾ-ੂੇੈੋ-੍ੑਖ਼-ੜਫ਼੦-ੵઁ-ઃઅ-ઍએ-ઑઓ-નપ-રલળવ-હ઼-ૅે-ૉો-્ૐૠ-ૣ૦-૯ૹ-૿ଁ-ଃଅ-ଌଏଐଓ-ନପ-ରଲଳଵ-ହ଼-ୄେୈୋ-୍ୖୗଡ଼ଢ଼ୟ-ୣ୦-୯ୱஂஃஅ-ஊஎ-ஐஒ-கஙசஜஞடணதந-பம-ஹா-ூெ-ைொ-்ௐௗ௦-௯ఀ-ఌఎ-ఐఒ-నప-హఽ-ౄె-ైొ-్ౕౖౘ-ౚౠ-ౣ౦-౯ಀ-ಃಅ-ಌಎ-ಐಒ-ನಪ-ಳವ-ಹ಼-ೄೆ-ೈೊ-್ೕೖೞೠ-ೣ೦-೯ೱೲഀ-ഃഅ-ഌഎ-ഐഒ-ൄെ-ൈൊ-ൎൔ-ൗൟ-ൣ൦-൯ൺ-ൿංඃඅ-ඖක-නඳ-රලව-ෆ්ා-ුූෘ-ෟ෦-෯ෲෳก-ฺเ-๎๐-๙ກຂຄຆ-ຊຌ-ຣລວ-ຽເ-ໄໆ່-ໍ໐-໙ໜ-ໟༀ༘༙༠-༩༹༵༷༾-ཇཉ-ཬཱ-྄྆-ྗྙ-ྼ࿆က-၉ၐ-ႝႠ-ჅჇჍა-ჺჼ-ቈቊ-ቍቐ-ቖቘቚ-ቝበ-ኈኊ-ኍነ-ኰኲ-ኵኸ-ኾዀዂ-ዅወ-ዖዘ-ጐጒ-ጕጘ-ፚ፝-፟ᎀ-ᎏᎠ-Ᏽᏸ-ᏽᐁ-ᙬᙯ-ᙿᚁ-ᚚᚠ-ᛪᛮ-ᛸᜀ-ᜌᜎ-᜔ᜠ-᜴ᝀ-ᝓᝠ-ᝬᝮ-ᝰᝲᝳក-៓ៗៜ៝០-៩᠋-᠍᠐-᠙ᠠ-ᡸᢀ-ᢪᢰ-ᣵᤀ-ᤞᤠ-ᤫᤰ-᤻᥆-ᥭᥰ-ᥴᦀ-ᦫᦰ-ᧉ᧐-᧙ᨀ-ᨛᨠ-ᩞ᩠-᩿᩼-᪉᪐-᪙ᪧ᪰-᪽ᬀ-ᭋ᭐-᭙᭫-᭳ᮀ-᯳ᰀ-᰷᱀-᱉ᱍ-ᱽᲀ-ᲈᲐ-ᲺᲽ-Ჿ᳐-᳔᳒-ᳺᴀ-᷹᷻-ἕἘ-Ἕἠ-ὅὈ-Ὅὐ-ὗὙὛὝὟ-ώᾀ-ᾴᾶ-ᾼιῂ-ῄῆ-ῌῐ-ΐῖ-Ίῠ-Ῥῲ-ῴῶ-ῼ‿⁀⁔ⁱⁿₐ-ₜ⃐-⃥⃜⃡-⃰ℂℇℊ-ℓℕℙ-ℝℤΩℨK-ℭℯ-ℹℼ-ℿⅅ-ⅉⅎⅠ-ↈⰀ-Ⱞⰰ-ⱞⱠ-ⳤⳫ-ⳳⴀ-ⴥⴧⴭⴰ-ⵧⵯ⵿-ⶖⶠ-ⶦⶨ-ⶮⶰ-ⶶⶸ-ⶾⷀ-ⷆⷈ-ⷎⷐ-ⷖⷘ-ⷞⷠ-ⷿⸯ々-〇〡-〯〱-〵〸-〼ぁ-ゖ゙゚ゝ-ゟァ-ヺー-ヿㄅ-ㄯㄱ-ㆎㆠ-ㆺㇰ-ㇿ㐀-䶵一-鿯ꀀ-ꒌꓐ-ꓽꔀ-ꘌꘐ-ꘫꙀ-꙯ꙴ-꙽ꙿ-꛱ꜗ-ꜟꜢ-ꞈꞋ-ꞿꟂ-Ᶎꟷ-ꠧꡀ-ꡳꢀ-ꣅ꣐-꣙꣠-ꣷꣻꣽ-꤭ꤰ-꥓ꥠ-ꥼꦀ-꧀ꧏ-꧙ꧠ-ꧾꨀ-ꨶꩀ-ꩍ꩐-꩙ꩠ-ꩶꩺ-ꫂꫛ-ꫝꫠ-ꫯꫲ-꫶ꬁ-ꬆꬉ-ꬎꬑ-ꬖꬠ-ꬦꬨ-ꬮꬰ-ꭚꭜ-ꭧꭰ-ꯪ꯬꯭꯰-꯹가-힣ힰ-ퟆퟋ-ퟻ豈-舘並-龎ﬀ-ﬆﬓ-ﬗיִ-ﬨשׁ-זּטּ-לּמּנּסּףּפּצּ-ﮱﯓ-ﴽﵐ-ﶏﶒ-ﷇﷰ-ﷻ︀-️︠-︯︳︴﹍-﹏ﹰ-ﹴﹶ-ﻼ０-９Ａ-Ｚ＿ａ-ｚｦ-ﾾￂ-ￇￊ-ￏￒ-ￗￚ-ￜ]/.test(context.peek(1)));
		return context.source.substring(position, context.position);
	}

	function skipWhitespace(context) {
		while (/\s/.test(context.peek(1))) {
			context.advance(1);
		}
	}
})();