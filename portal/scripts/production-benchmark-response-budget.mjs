export function evaluateHttpResponse(sample, options) {
  const failures = [];
  if (sample.status !== 200) failures.push(`${options.label} status ${sample.status}`);
  if (sample.bytes > options.maxBytes) {
    failures.push(`${options.label} payload ${sample.bytes}B > ${options.maxBytes}B`);
  }
  return failures;
}

export function evaluateRepeatedHttpResponses(samples, maxBytes) {
  return samples.flatMap((sample, index) => evaluateHttpResponse(sample, {
    label: `repeated ${index + 1}`,
    maxBytes,
  }));
}
