const QUESTION_PATTERNS = [
  /^(tell me|walk me through|describe|explain)/i,
  /^(how do you|how would you|how did you|how have you)/i,
  /^(what is your|what are your|what was|what would you|what do you)/i,
  /^(why did you|why do you|why would you|why are you)/i,
  /^(can you|could you|would you|have you)/i,
  /^(give me an example|share an example|share a time)/i,
  /^(in your experience|from your perspective)/i,
  /^(when was|when have you|when did you)/i,
  /^(where do you|where have you)/i,
  /^(do you|did you|are you|were you|is there|have you ever)/i,
];

class QuestionDetector {
  constructor() {
    this.buffer = [];
    this.BUFFER_MAX = 5;
  }

  process(transcript) {
    const trimmed = transcript.trim();
    if (!trimmed) return { isQuestion: false, text: '' };

    this.buffer.push(trimmed);
    if (this.buffer.length > this.BUFFER_MAX) {
      this.buffer.shift();
    }

    // Check 1: Ends with question mark
    if (trimmed.endsWith('?')) {
      return { isQuestion: true, text: trimmed };
    }

    // Check 2: Matches question starter pattern
    for (const pattern of QUESTION_PATTERNS) {
      if (pattern.test(trimmed)) {
        return { isQuestion: true, text: trimmed };
      }
    }

    // Check 3: Compound question — combine last 2 utterances
    if (this.buffer.length >= 2) {
      const combined = this.buffer.slice(-2).join(' ');
      if (combined.endsWith('?')) {
        return { isQuestion: true, text: combined };
      }
      for (const pattern of QUESTION_PATTERNS) {
        if (pattern.test(this.buffer[this.buffer.length - 1]) ||
            pattern.test(combined)) {
          return { isQuestion: true, text: combined };
        }
      }
    }

    return { isQuestion: false, text: trimmed };
  }

  reset() {
    this.buffer = [];
  }
}

module.exports = { QuestionDetector };
