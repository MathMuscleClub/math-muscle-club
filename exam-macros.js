(function () {
    function parse(source) {
        const tags = collectCommandArgs(source, 'examtag', 1).map(item => normalizeSpace(item.args[0]));
        const field = collectCommandArgs(source, 'examfield', 1)[0]?.args?.[0]
            || collectCommandArgs(source, 'examsubject', 1)[0]?.args?.[0]
            || '';
        const related = collectCommandArgs(source, 'examrelated', 2).map(item => ({
            id: normalizeSpace(item.args[0]),
            label: normalizeSpace(item.args[1])
        }));
        const body = applyDeclaredOperators(source, getDocumentBody(source))
            .replace(/\\maketitle/g, '')
            .trim();

        return {
            field: normalizeSpace(field),
            tags,
            related,
            html: renderLatexFragment(body),
            plainText: latexToPlainText(body)
        };
    }

    function splitSubmission(source, metadata = {}, defaultKind = '') {
        const body = applyDeclaredOperators(source, getDocumentBody(source))
            .replace(/\\maketitle/g, '')
            .trim();
        const metadataParts = splitByMetadataBlocks(body, metadata, defaultKind);
        if (metadataParts.length > 0) return metadataParts;

        const headings = [
            ...collectCommandArgs(body, 'section*', 1).map(match => ({ ...match, command: 'section*' })),
            ...collectCommandArgs(body, 'section', 1).map(match => ({ ...match, command: 'section' }))
        ]
            .sort((a, b) => a.start - b.start);

        if (headings.length === 0) {
            const fallbackTitle = metadata.title || '提出された解答';
            const kind = normalizeExamKind(defaultKind || metadata.kind || fallbackTitle);
            const isProblem = kind === 'problem';
            return [{
                id: makeSectionId(metadata, fallbackTitle, kind),
                kind,
                title: fallbackTitle,
                year: normalizeYear(metadata.year),
                era: normalizeSpace(metadata.era),
                field: isProblem ? normalizeSpace(metadata.field) : '',
                problemGroup: normalizeProblemGroup(metadata.problemGroup),
                problemNumber: normalizeProblemNumber(metadata.problemNumber || '1'),
                summary: normalizeSpace(metadata.summary),
                tags: isProblem && Array.isArray(metadata.tags) ? metadata.tags : [],
                html: renderLatexFragment(body),
                plainText: latexToPlainText(body),
                source: body
            }];
        }

        return headings.map((heading, index) => {
            const next = headings[index + 1];
            const title = normalizeSpace(heading.args[0]);
            const parsed = parseExamSectionTitle(title, metadata);
            const kind = normalizeExamKind(defaultKind || parsed.kind);
            const isProblem = kind === 'problem';
            const sectionBody = body.slice(heading.end, next ? next.start : body.length).trim();

            return {
                id: makeSectionId(metadata, title, kind),
                kind,
                title,
                year: normalizeYear(metadata.year),
                era: normalizeSpace(metadata.era),
                field: isProblem ? normalizeSpace(metadata.field) : '',
                problemGroup: parsed.problemGroup,
                problemNumber: parsed.problemNumber,
                summary: normalizeSpace(metadata.summary),
                tags: isProblem && Array.isArray(metadata.tags) ? metadata.tags : [],
                html: renderLatexFragment(sectionBody),
                plainText: latexToPlainText(sectionBody),
                source: sectionBody
            };
        }).filter(section => section.html || section.plainText);
    }

    function splitByMetadataBlocks(body, metadata, defaultKind) {
        const starts = findMetadataBlockStarts(body);
        if (starts.length === 0) return [];

        return starts.map((start, index) => {
            const end = starts[index + 1] ?? body.length;
            const source = body.slice(start, end).trim();
            const parsed = parseExamMetadata(source, metadata, defaultKind);
            const content = stripExamMetadataCommands(source).trim();

            return {
                id: makeSectionId(parsed, parsed.title || parsed.problemNumber || source, parsed.kind),
                kind: parsed.kind,
                title: parsed.title || makeDefaultSectionTitle(parsed),
                year: parsed.year,
                era: parsed.era,
                field: parsed.field,
                problemGroup: parsed.problemGroup,
                problemNumber: parsed.problemNumber,
                summary: parsed.summary,
                tags: parsed.tags,
                html: renderLatexFragment(content),
                plainText: latexToPlainText(content),
                source
            };
        }).filter(part => part.html || part.plainText);
    }

    function findMetadataBlockStarts(source) {
        const commands = collectMetadataCommandMatches(source);
        if (commands.length === 0) return [];

        const yearStarts = commands.filter(item => item.command === 'examyear').map(item => item.start);
        if (yearStarts.length > 1) return uniqueSorted(yearStarts);

        const numberStarts = commands.filter(item => item.command === 'examnumber' || item.command === 'examproblemnumber').map(item => item.start);
        if (numberStarts.length > 1) {
            return uniqueSorted([commands[0].start, ...numberStarts.slice(1)]);
        }

        return [commands[0].start];
    }

    function parseExamMetadata(source, defaults = {}, defaultKind = '') {
        const read = (...names) => {
            for (const name of names) {
                const values = collectCommandArgs(source, name, 1);
                if (values.length > 0) return normalizeSpace(values[0].args[0]);
            }
            return '';
        };
        const title = read('examtitle') || normalizeSpace(defaults.title);
        const kindText = read('examkind', 'examtype');
        const kind = normalizeExamKind(defaultKind || defaults.kind || kindText || title);
        const isProblem = kind === 'problem';
        const tags = isProblem
            ? uniqueValues([
                ...(Array.isArray(defaults.tags) ? defaults.tags : []),
                ...collectCommandArgs(source, 'examtag', 1).map(item => normalizeSpace(item.args[0]))
            ])
            : [];

        return {
            ...defaults,
            kind,
            title,
            year: normalizeYear(read('examyear') || defaults.year),
            era: read('examera') || normalizeSpace(defaults.era),
            field: isProblem ? (read('examfield', 'examsubject') || normalizeSpace(defaults.field)) : '',
            problemGroup: normalizeProblemGroup(read('examgroup', 'examproblemgroup') || defaults.problemGroup),
            problemNumber: normalizeProblemNumber(read('examnumber', 'examproblemnumber') || defaults.problemNumber),
            summary: read('examsummary') || normalizeSpace(defaults.summary),
            tags
        };
    }

    function collectMetadataCommandMatches(source) {
        return [
            'examyear',
            'examera',
            'examfield',
            'examsubject',
            'examgroup',
            'examproblemgroup',
            'examnumber',
            'examproblemnumber',
            'examtitle',
            'examsummary',
            'examkind',
            'examtype'
        ].flatMap(command => collectCommandArgs(source, command, 1).map(match => ({
            ...match,
            command
        }))).sort((a, b) => a.start - b.start);
    }

    function stripExamMetadataCommands(source) {
        return [
            'examyear',
            'examera',
            'examfield',
            'examsubject',
            'examgroup',
            'examproblemgroup',
            'examnumber',
            'examproblemnumber',
            'examtitle',
            'examsummary',
            'examkind',
            'examtype',
            'examtag'
        ].reduce((output, command) => replaceCommand(output, command, 1, () => ''), source);
    }

    function makeDefaultSectionTitle(metadata) {
        const year = metadata.era || (metadata.year ? `${metadata.year}年度` : '');
        const group = metadata.problemGroup ? `${metadata.problemGroup}問題` : '';
        const number = metadata.problemNumber ? `第${metadata.problemNumber}問` : '';
        return [year, group, number].filter(Boolean).join(' ') || '提出されたTeX';
    }

    function normalizeExamKind(value) {
        const text = normalizeSpace(value).toLowerCase();
        if (/問題|problem|question/.test(text)) return 'problem';
        if (/解答|解説|答案|answer|solution/.test(text)) return 'answer';
        return 'answer';
    }

    function parseExamSectionTitle(title, metadata = {}) {
        const normalizedTitle = normalizeSpace(title);
        const normalizedAscii = toHalfWidth(normalizedTitle);
        const answerLike = /(解答|解説|答案|solution|answer)/i.test(normalizedAscii);
        const groupMatch = normalizedAscii.match(/(?:^|\s)([A-Z])\s*(?:問題)?\s*第?\s*([0-9]+(?:\s*[-–ー〜~]\s*[0-9]+)?)\s*問?/i)
            || normalizedAscii.match(/(?:^|\s)([A-Z])\s*問題/i);
        const numberMatch = normalizedAscii.match(/第\s*([0-9]+(?:\s*[-–ー〜~]\s*[0-9]+)?)\s*問/)
            || normalizedAscii.match(/(?:問|No\.?)\s*([0-9]+(?:\s*[-–ー〜~]\s*[0-9]+)?)/i);

        return {
            kind: answerLike ? 'answer' : 'problem',
            problemGroup: normalizeProblemGroup(groupMatch?.[1] || metadata.problemGroup),
            problemNumber: normalizeProblemNumber(numberMatch?.[1] || metadata.problemNumber || '1')
        };
    }

    function renderLatexFragment(source) {
        const blocks = [];
        let text = source.trim();

        const stash = html => {
            const token = `%%EXAM_HTML_BLOCK_${blocks.length}%%`;
            blocks.push(html);
            return `\n${token}\n`;
        };

        // マクロ定義を抽出して数式環境で囲んで stash する
        const macroDeclarations = collectAllowedMacroDeclarations(text);
        for (let i = macroDeclarations.length - 1; i >= 0; i--) {
            const decl = macroDeclarations[i];
            const mathWrapped = `\\(${decl.text}\\)`;
            const token = stash(mathWrapped);
            text = text.slice(0, decl.start) + token + text.slice(decl.end);
        }

        text = replaceEnvironment(text, 'enumerate', body => stash(renderList(body, 'ol')));
        text = replaceEnvironment(text, 'itemize', body => stash(renderList(body, 'ul')));
        text = replaceCommand(text, 'fold', 2, args => stash(renderFold(args[0], args[1])));
        text = replaceCommand(text, 'hint', 1, args => stash(renderCallout('ヒント', args[0])));
        text = replaceCommand(text, 'strategy', 1, args => stash(renderCallout('方針', args[0])));
        text = replaceCommand(text, 'section*', 1, args => stash(`<h4 class="exam-source-heading">${escapeHTML(normalizeSpace(args[0]))}</h4>`));
        text = replaceCommand(text, 'subsection*', 1, args => stash(`<h5 class="exam-source-subheading">${escapeHTML(normalizeSpace(args[0]))}</h5>`));
        text = replaceCommand(text, 'examtag', 1, () => '');
        text = replaceCommand(text, 'examrelated', 2, () => '');
        text = stripExamMetadataCommands(text);

        let html = paragraphize(text);
        blocks.forEach((block, index) => {
            const token = `%%EXAM_HTML_BLOCK_${index}%%`;
            html = html
                .replaceAll(`<p>${token}</p>`, block)
                .replaceAll(token, block);
        });
        return html;
    }

    function renderFold(summary, body) {
        return `
            <details class="exam-fold">
                <summary>${renderInline(summary)}</summary>
                <div class="exam-fold-body">${renderLatexFragment(body)}</div>
            </details>
        `;
    }

    function renderCallout(label, body) {
        return `
            <div class="exam-callout">
                <div class="exam-callout-label">${escapeHTML(label)}</div>
                <div class="exam-callout-body">${renderLatexFragment(body)}</div>
            </div>
        `;
    }

    function renderList(body, tagName) {
        const items = body
            .split(/\\item\b/g)
            .map(item => item.trim())
            .filter(Boolean)
            .map(item => `<li>${renderLatexFragment(item)}</li>`)
            .join('');
        return `<${tagName} class="exam-source-list">${items}</${tagName}>`;
    }

    function paragraphize(source) {
        return source
            .split(/\n{2,}/)
            .map(block => block.trim())
            .filter(Boolean)
            .map(block => `<p>${escapeHTML(block).replace(/\n/g, '<br>')}</p>`)
            .join('');
    }

    function renderInline(source) {
        return escapeHTML(normalizeSpace(source));
    }

    function collectCommandArgs(source, command, arity) {
        const matches = [];
        const needle = `\\${command}`;
        let index = 0;

        while ((index = source.indexOf(needle, index)) !== -1) {
            const next = source[index + needle.length] || '';
            if (/[A-Za-z]/.test(next)) {
                index += needle.length;
                continue;
            }

            const parsed = readArgs(source, index + needle.length, arity);
            if (parsed) {
                matches.push({ start: index, end: parsed.end, args: parsed.args });
                index = parsed.end;
            } else {
                index += needle.length;
            }
        }

        return matches;
    }

    function replaceCommand(source, command, arity, render) {
        const matches = collectCommandArgs(source, command, arity);
        if (matches.length === 0) return source;

        let output = '';
        let cursor = 0;
        matches.forEach(match => {
            output += source.slice(cursor, match.start);
            output += render(match.args);
            cursor = match.end;
        });
        output += source.slice(cursor);
        return output;
    }

    function replaceEnvironment(source, name, render) {
        const begin = `\\begin{${name}}`;
        const end = `\\end{${name}}`;
        let output = '';
        let cursor = 0;
        let start;

        while ((start = source.indexOf(begin, cursor)) !== -1) {
            const bodyStart = start + begin.length;
            const bodyEnd = source.indexOf(end, bodyStart);
            if (bodyEnd === -1) break;

            output += source.slice(cursor, start);
            output += render(source.slice(bodyStart, bodyEnd));
            cursor = bodyEnd + end.length;
        }

        output += source.slice(cursor);
        return output;
    }

    function readArgs(source, start, arity) {
        const args = [];
        let cursor = start;

        for (let i = 0; i < arity; i++) {
            while (/\s/.test(source[cursor] || '')) cursor++;
            if (source[cursor] !== '{') return null;

            const braced = readBraced(source, cursor);
            if (!braced) return null;
            args.push(braced.value);
            cursor = braced.end;
        }

        return { args, end: cursor };
    }

    function readBraced(source, start) {
        let depth = 0;

        for (let index = start; index < source.length; index++) {
            const char = source[index];
            const escaped = index > 0 && source[index - 1] === '\\';

            if (char === '{' && !escaped) {
                depth++;
            } else if (char === '}' && !escaped) {
                depth--;
                if (depth === 0) {
                    return {
                        value: source.slice(start + 1, index),
                        end: index + 1
                    };
                }
            }
        }

        return null;
    }

    function getDocumentBody(source) {
        const begin = '\\begin{document}';
        const end = '\\end{document}';
        const bodyStart = source.indexOf(begin);
        const bodyEnd = source.indexOf(end);
        if (bodyStart === -1 || bodyEnd === -1 || bodyEnd <= bodyStart) {
            return source;
        }
        return source.slice(bodyStart + begin.length, bodyEnd);
    }

    function latexToPlainText(source) {
        return source
            .replace(/\\begin\{[^}]+\}|\\end\{[^}]+\}/g, ' ')
            .replace(/\\[A-Za-z*]+\s*/g, ' ')
            .replace(/[{}]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function applyDeclaredOperators(source, body) {
        const operators = collectCommandArgs(source, 'DeclareMathOperator', 2)
            .map(item => ({
                command: normalizeSpace(item.args[0]).replace(/^\\/, ''),
                label: normalizeSpace(item.args[1])
            }))
            .filter(item => item.command && item.label);

        return operators.reduce((output, operator) => {
            const pattern = new RegExp(`\\\\${escapeRegExp(operator.command)}\\b`, 'g');
            return output.replace(pattern, `\\operatorname{${operator.label}}`);
        }, body);
    }

    function escapeRegExp(value) {
        return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function normalizeSpace(value) {
        return String(value ?? '').replace(/\s+/g, ' ').trim();
    }

    function uniqueValues(values) {
        return [...new Set(values.map(value => String(value || '').trim()).filter(Boolean))];
    }

    function uniqueSorted(values) {
        return [...new Set(values)].sort((a, b) => a - b);
    }

    function normalizeYear(value) {
        const year = toHalfWidth(value || '').replace(/[^0-9]/g, '');
        return year ? Number(year) : '';
    }

    function normalizeProblemGroup(value) {
        const group = toHalfWidth(value || '').trim().toUpperCase();
        return group;
    }

    function normalizeProblemNumber(value) {
        return toHalfWidth(value || '')
            .replace(/\s+/g, '')
            .replace(/[–ー〜~]/g, '-')
            .replace(/^第/, '')
            .replace(/問$/, '')
            .trim();
    }

    function makeSectionId(metadata, title, kind) {
        return [
            metadata.id || metadata.texPath || 'submission',
            kind,
            normalizeProblemGroup(metadata.problemGroup),
            normalizeProblemNumber(metadata.problemNumber || title)
        ].join('-').replace(/[^A-Za-z0-9_-]+/g, '-');
    }

    function toHalfWidth(value) {
        return String(value ?? '').replace(/[Ａ-Ｚａ-ｚ０-９]/g, char => {
            return String.fromCharCode(char.charCodeAt(0) - 0xFEE0);
        });
    }

    function escapeHTML(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    const MACRO_RULES = [
        { name: "DeclareMathOperator", requiredArgs: 2 },
        { name: "DeclareMathOperator*", requiredArgs: 2 },
        { name: "newcommand", requiredArgs: 2, optionalArgs: true, maxOptionalArgs: 2 },
        { name: "newcommand*", requiredArgs: 2, optionalArgs: true, maxOptionalArgs: 2 },
        { name: "providecommand", requiredArgs: 2, optionalArgs: true, maxOptionalArgs: 2 },
        { name: "providecommand*", requiredArgs: 2, optionalArgs: true, maxOptionalArgs: 2 }
    ];

    function collectAllowedMacroDeclarations(source) {
        const rules = [...MACRO_RULES].sort((a, b) => b.name.length - a.name.length);
        const declarations = [];

        for (const rule of rules) {
            const needle = `\\${rule.name}`;
            let index = 0;
            while ((index = source.indexOf(needle, index)) !== -1) {
                const next = source[index + needle.length] || '';
                if (/[A-Za-z]/.test(next) || (!rule.name.endsWith('*') && next === '*')) {
                    index += needle.length;
                    continue;
                }

                const declaration = readAllowedMacroDeclaration(source, index, rule);
                if (declaration) {
                    declarations.push({ start: index, end: index + declaration.length, text: declaration });
                    index += declaration.length;
                } else {
                    index += needle.length;
                }
            }
        }

        return removeNestedMacroDeclarations(declarations.sort((a, b) => a.start - b.start));
    }

    function removeNestedMacroDeclarations(declarations) {
        const selected = [];
        for (const declaration of declarations) {
            const isNested = selected.some(item => declaration.start >= item.start && declaration.end <= item.end);
            if (!isNested) selected.push(declaration);
        }
        return selected;
    }

    function readAllowedMacroDeclaration(source, start, rule) {
        let cursor = start + rule.name.length + 1;
        let requiredRead = 0;
        let optionalRead = 0;
        const maxOptionalArgs = Math.max(0, rule.maxOptionalArgs ?? 0);

        while (cursor < source.length) {
            cursor = skipInlineSpace(source, cursor);

            if (rule.optionalArgs && optionalRead < maxOptionalArgs && source[cursor] === '[') {
                const bracketed = readBracketed(source, cursor);
                if (!bracketed) return '';
                cursor = bracketed.end;
                optionalRead++;
                continue;
            }

            if (source[cursor] === '{') {
                const braced = readBraced(source, cursor);
                if (!braced) return '';
                cursor = braced.end;
                requiredRead++;
                if (requiredRead >= rule.requiredArgs) break;
                continue;
            }

            return '';
        }

        if (requiredRead < rule.requiredArgs) return '';
        return source.slice(start, cursor).trim();
    }

    function readBracketed(source, start) {
        let depth = 0;
        for (let index = start; index < source.length; index++) {
            const char = source[index];
            const escaped = index > 0 && source[index - 1] === '\\';

            if (char === '[' && !escaped) {
                depth++;
            } else if (char === ']' && !escaped) {
                depth--;
                if (depth === 0) {
                    return {
                        value: source.slice(start + 1, index),
                        end: index + 1
                    };
                }
            }
        }
        return null;
    }

    function skipInlineSpace(source, start) {
        let cursor = start;
        while (/[ \t\r\n]/.test(source[cursor] || '')) cursor++;
        return cursor;
    }

    window.ExamMacros = {
        parse,
        splitSubmission,
        renderLatexFragment
    };
})();
