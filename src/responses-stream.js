// Reads a Responses API SSE stream, forwards accumulated text, and returns only completed output.
export async function consumeResponsesStream(stream, onText = () => {}) {
  if (!stream) throw new Error('Missing response stream.');
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  let completed = false;

  // Parses one SSE block, appending text deltas or recording final completion state.
  function consume(block) {
    const data = block.split('\n').filter((line) => line.startsWith('data:')).map((line) => line.slice(5).replace(/^ /, '')).join('\n');
    if (!data || data === '[DONE]') return;
    const event = JSON.parse(data);
    if (['error', 'response.failed', 'response.incomplete'].includes(event.type)) throw new Error('The response stream did not complete.');
    if (event.type === 'response.output_text.delta' || event.type === 'response.refusal.delta') {
      text += event.delta || '';
      if (text.length > 100000) throw new Error('Response exceeded the display limit.');
      onText(text);
    }
    if (event.type === 'response.completed') {
      if (event.response?.status && event.response.status !== 'completed') throw new Error('The response did not complete.');
      const final = event.response?.output_text || (event.response?.output || []).flatMap((item) => item.content || []).map((part) => part.text || part.refusal || '').join('');
      if (final) text = final;
      completed = true;
    }
  }

  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      buffer = buffer.replace(/\r\n/g, '\n');
      let boundary;
      while ((boundary = buffer.indexOf('\n\n')) !== -1) {
        consume(buffer.slice(0, boundary));
        buffer = buffer.slice(boundary + 2);
      }
      if (buffer.length > 262144) throw new Error('Invalid response event size.');
      if (done) { if (buffer.trim()) consume(buffer); break; }
    }
    if (!completed || !text.trim()) throw new Error('The response stream ended before completion.');
    return text;
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
