const STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'shall', 'can', 'to', 'of', 'in', 'for',
  'on', 'with', 'at', 'by', 'from', 'as', 'into', 'about', 'your',
  'you', 'me', 'my', 'i', 'we', 'our', 'tell', 'how', 'what', 'why',
  'when', 'where', 'which', 'that', 'this', 'it', 'and', 'or', 'but',
  'if', 'than', 'so', 'very', 'just', 'also', 'more', 'some', 'any',
  'all', 'each', 'every', 'both', 'few', 'most', 'other', 'like',
  'through', 'during', 'before', 'after', 'above', 'below', 'between',
  'same', 'different', 'been', 'being', 'having', 'doing', 'going',
  'get', 'got', 'getting', 'make', 'made', 'making', 'know', 'think',
  'really', 'right', 'well', 'much', 'even', 'back', 'way', 'thing',
  'things', 'them', 'they', 'their', 'there', 'then', 'now', 'here',
  'these', 'those', 'not', 'dont', "don't", 'its', "it's", 'one',
  'two', 'three', 'first', 'second', 'new', 'good', 'great', 'able',
  'something', 'around', 'kind', 'lot', 'give', 'given', 'talk',
  'walk', 'say', 'said', 'example', 'time', 'describe', 'explain'
]);

function extractKeywords(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter(word => word.length > 2 && !STOP_WORDS.has(word));
}

function scoreExample(example, questionKeywords, questionText) {
  let score = 0;
  const qText = questionText.toLowerCase();
  const qSet = new Set(questionKeywords);

  // Highest weight: phrase match in questionKeywords (5 points)
  // Track which question keywords have already been matched to avoid over-counting
  const matchedQWords = new Set();

  for (const phrase of example.questionKeywords) {
    if (qText.includes(phrase.toLowerCase())) {
      score += 5;
      // Mark all words in the phrase as matched
      phrase.toLowerCase().split(/\s+/).forEach(w => matchedQWords.add(w));
    }
  }

  // Individual word matches from questionKeywords (3 points, deduplicated)
  for (const phrase of example.questionKeywords) {
    const phraseWords = phrase.toLowerCase().split(/\s+/);
    for (const w of phraseWords) {
      if (w.length > 2 && qSet.has(w) && !matchedQWords.has(w)) {
        matchedQWords.add(w);
        score += 3;
      }
    }
  }

  // Medium weight: tag match (2 points, deduplicated against already-matched words)
  const matchedTagWords = new Set();
  for (const tag of example.tags) {
    const tagWords = tag.toLowerCase().split('-');
    for (const w of tagWords) {
      if (w.length > 2 && qSet.has(w) && !matchedTagWords.has(w)) {
        matchedTagWords.add(w);
        score += 2;
      }
    }
  }

  // Low weight: words in lead/context (1 point each, capped at 5)
  const contentKeywords = extractKeywords(`${example.lead} ${example.context}`);
  const contentSet = new Set(contentKeywords);
  let contentScore = 0;
  for (const kw of questionKeywords) {
    if (contentSet.has(kw)) contentScore += 1;
  }
  score += Math.min(contentScore, 5);

  return score;
}

class Matcher {
  constructor(examples) {
    this.examples = examples;
  }

  match(questionText, sourceChunks = []) {
    const keywords = extractKeywords(questionText);

    if (keywords.length === 0) {
      return { match: null, runnerUp: null };
    }

    // Score curated examples
    const scored = this.examples.map(example => ({
      example,
      score: scoreExample(example, keywords, questionText)
    }));

    // Also score source chunks (lower priority — they become fallback matches)
    if (sourceChunks.length > 0) {
      const qSet = new Set(keywords);
      for (const chunk of sourceChunks) {
        const chunkKeywords = extractKeywords(chunk.text);
        const chunkSet = new Set(chunkKeywords);
        let overlap = 0;
        for (const kw of keywords) {
          if (chunkSet.has(kw)) overlap++;
        }
        // Only include if meaningful overlap (3+ keyword matches)
        if (overlap >= 3) {
          // Truncate text for display
          const preview = chunk.text.substring(0, 200).trim();
          scored.push({
            example: {
              id: `source:${chunk.source}`,
              lead: preview + (chunk.text.length > 200 ? '...' : ''),
              category: 'source-content',
              metrics: '',
              context: `From ${chunk.source}: ${chunk.file}`,
              tags: [],
              questionKeywords: [],
              sourceFile: chunk.file,
            },
            score: overlap, // Raw keyword overlap (typically 3-8, below curated example scores)
          });
        }
      }
    }

    scored.sort((a, b) => b.score - a.score);

    if (scored[0].score === 0) {
      return { match: null, runnerUp: null };
    }

    return {
      match: scored[0],
      runnerUp: scored.length > 1 && scored[1].score > 0 ? scored[1] : null
    };
  }
}

module.exports = { Matcher, extractKeywords };
