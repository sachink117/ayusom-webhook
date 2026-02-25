function saveToSheet(data) {
  const postData = JSON.stringify(data);
  
  const options = {
    hostname: 'script.google.com',
    path: '/macros/s/AKfycbzz8Zd4oAQHCzNaUFu0EIV_sD0BK75XO0WJDN69jD2cVyK-okSyMrl2VfCbjhH_kQsSbg/exec',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  const req = https.request(options, res => {
    let body = '';
    console.log('Sheet status:', res.statusCode);
    console.log('Redirect location:', res.headers.location);
    res.on('data', chunk => body += chunk);
    res.on('end', () => console.log('Sheet body:', body.substring(0, 200)));
  });
  req.on('error', e => console.error('Sheet error:', e));
  req.write(postData);
  req.end();
}
