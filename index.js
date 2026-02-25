function saveToSheet(data) {
  const postData = JSON.stringify(data);
  const url = new URL(GOOGLE_SHEET_URL);
  
  const options = {
    hostname: url.hostname,
    path: url.pathname + url.search,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    },
    followRedirects: true
  };

  const makeRequest = (reqOptions) => {
    const req = https.request(reqOptions, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          const redirectUrl = new URL(res.headers.location);
          const newOptions = {
            hostname: redirectUrl.hostname,
            path: redirectUrl.pathname + redirectUrl.search,
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(postData)
            }
          };
          makeRequest(newOptions);
        } else {
          console.log('Sheet saved:', body);
        }
      });
    });
    req.on('error', e => console.error('Sheet error:', e));
    req.write(postData);
    req.end();
  };

  makeRequest(options);
}
