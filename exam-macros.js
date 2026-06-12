(function () {
    function parse(source) {
        const tags = collectCommandArgs(source, 'examtag', 1).map(item => normalizeSpace(item.args[0]));
        const related = collectCommandArgs(source, 'examrelated', 2).map(item => ({
            id: normalizeSpace(item.args[0]),
            label: normalizeSpace(item.args[1])
        }));
        const body = getDocumentBody(source)
            .replace(/\\maketitle/g, '')
            .trim();

        return {
            tags,
            related,
            html: renderLatexFragment(body),
            plainText: latexToPlainText(body)
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

        text = replaceEnvironment(text, 'enumerate', body => stash(renderList(body, 'ol')));
        text = replaceEnvironment(text, 'itemize', body => stash(renderList(body, 'ul')));
        text = replaceCommand(text, 'fold', 2, args => stash(renderFold(args[0], args[1])));
        text = replaceCommand(text, 'hint', 1, args => stash(renderCallout('ヒント', args[0])));
        text = replaceCommand(text, 'strategy', 1, args => stash(renderCallout('方針', args[0])));
        text = replaceCommand(text, 'section*', 1, args => stash(`<h4 class="exam-source-heading">${escapeHTML(normalizeSpace(args[0]))}</h4>`));
        text = replaceCommand(text, 'subsection*', 1, args => stash(`<h5 class="exam-source-subheading">${escapeHTML(normalizeSpace(args[0]))}</h5>`));
        text = replaceCommand(text, 'examtag', 1, () => '');
        text = replaceCommand(text, 'examrelated', 2, () => '');

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

    function normalizeSpace(value) {
        return String(value ?? '').replace(/\s+/g, ' ').trim();
    }

    function escapeHTML(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    window.ExamMacros = {
        parse,
        renderLatexFragment
    };
})();
