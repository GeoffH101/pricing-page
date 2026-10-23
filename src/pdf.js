// One-page PDF of a quote, built on request and sent straight back (nothing is stored).
const PDFDocument = require('pdfkit');

const COMPANY = 'Spotless Gutter Cleaning';
const CARD_NOTICE = [
  'Your card is held on file and will not be charged until after the work is complete. Without a card on file we cannot book the service.',
  'You will receive a text link to securely fill in your credit card information.',
];

const money = (n) => '$' + Number(n).toLocaleString('en-US');

// data: { price, address, sqft, area, customer: { name, phone, email }, answers: { ...labels }, nextStep }
function buildQuotePdf(data) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margin: 54, info: { Title: 'Gutter Cleaning Quote', Author: COMPANY } });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const W = doc.page.width - 108;
    const green = '#1f6f4a';
    const grey = '#5d6a63';

    doc.fillColor(green).font('Helvetica-Bold').fontSize(20).text(COMPANY);
    doc.fillColor('#1c2420').font('Helvetica').fontSize(12).text('Gutter Cleaning Quote');
    doc.fillColor(grey).fontSize(10).text(new Date().toLocaleDateString('en-US', { timeZone: 'America/New_York', year: 'numeric', month: 'long', day: 'numeric' }));
    doc.moveDown(0.6);
    doc.moveTo(54, doc.y).lineTo(54 + W, doc.y).strokeColor('#dbe2de').lineWidth(1).stroke();
    doc.moveDown(0.8);

    const row = (label, value) => {
      if (!value) return;
      doc.fillColor(grey).font('Helvetica').fontSize(9).text(label.toUpperCase(), { continued: false });
      doc.fillColor('#1c2420').font('Helvetica').fontSize(12).text(value);
      doc.moveDown(0.5);
    };
    const c = data.customer || {};
    row('Prepared for', c.name);
    row('Phone', c.phone);
    row('Email', c.email);
    row('Property', data.address);
    row('Home size', data.sqft ? `${Number(data.sqft).toLocaleString('en-US')} sq ft` : '');

    doc.moveDown(0.4);
    const y = doc.y;
    doc.roundedRect(54, y, W, 78, 8).fillColor('#eef2ef').fill();
    doc.fillColor(grey).font('Helvetica').fontSize(10).text('GUTTER CLEANING', 54 + 16, y + 12);
    doc.fillColor(green).font('Helvetica-Bold').fontSize(34).text(money(data.price), 54 + 16, y + 28);
    doc.y = y + 78 + 14;

    const answers = data.answers || {};
    const keys = Object.keys(answers).filter((k) => answers[k]);
    if (keys.length) {
      doc.fillColor(grey).font('Helvetica-Bold').fontSize(10).text('DETAILS');
      doc.moveDown(0.3);
      keys.forEach((k) => {
        doc.fillColor('#1c2420').font('Helvetica').fontSize(11).text(`${k}: ${answers[k]}`);
      });
      doc.moveDown(0.8);
    }
    if (data.nextStep) {
      doc.fillColor(grey).font('Helvetica-Bold').fontSize(10).text('NEXT STEP');
      doc.moveDown(0.2);
      doc.fillColor('#1c2420').font('Helvetica').fontSize(12).text(data.nextStep);
      doc.moveDown(0.8);
    }

    const by = doc.y;
    const boxH = 112;
    doc.roundedRect(54, by, W, boxH, 8).lineWidth(1).strokeColor('#dbe2de').stroke();
    doc.fillColor('#1c2420').font('Helvetica-Bold').fontSize(12).text('Credit card info', 54 + 14, by + 12, { width: W - 28 });
    doc.font('Helvetica').fontSize(10.5).text(CARD_NOTICE[0], 54 + 14, by + 32, { width: W - 28 });
    doc.font('Helvetica-Bold').text(CARD_NOTICE[1], 54 + 14, doc.y + 6, { width: W - 28 });
    doc.end();
  });
}

module.exports = { buildQuotePdf };
