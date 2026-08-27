(function (global) {
  'use strict';

  function makeResumeToken(state, savedAtIso, email) {
    var payload = { savedAt: savedAtIso, hcState: state };
    if (email) payload.email = email;
    try {
      return btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
    } catch (error) {
      return null;
    }
  }

  function makeResumeUrl(locationLike, state, savedAtIso, email) {
    var token = makeResumeToken(state, savedAtIso, email);
    if (!token) return null;
    return locationLike.origin + locationLike.pathname + '?resume=' + encodeURIComponent(token);
  }

  function makeEmailDraftUrl(resultUrl) {
    var subject = encodeURIComponent('My Milesy Health Check results');
    var body = encodeURIComponent(
      'Here is my completed Milesy Health Check. This private result link restores the answers and expires after seven days.\n\n' + resultUrl,
    );
    return 'mailto:?subject=' + subject + '&body=' + body;
  }

  function copyResultLink(resultUrl, clipboard) {
    if (!clipboard || typeof clipboard.writeText !== 'function') {
      return Promise.reject(new Error('Clipboard access is unavailable.'));
    }
    return Promise.resolve(clipboard.writeText(resultUrl));
  }

  global.HCShare = {
    makeResumeToken: makeResumeToken,
    makeResumeUrl: makeResumeUrl,
    makeEmailDraftUrl: makeEmailDraftUrl,
    copyResultLink: copyResultLink,
  };
})(window);
