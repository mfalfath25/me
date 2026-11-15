# Markdoc, not MDX, for Post and Project bodies

MDX bodies are compiled JavaScript, which is awkward to store in a database and slow to render on request. Markdoc is plain text with declarative custom tags (`{% ref %}`), safe to parse and render at any time, so it survives a move to a database (ADR 0001) unchanged. Interactive pieces (Experiments) are still embeddable later through a Markdoc tag that renders a React island.
