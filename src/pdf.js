// One-page (or two) PDF of a quote, built on request and sent straight back (nothing is stored).
const path = require('path');
const PDFDocument = require('pdfkit');

const LOGO = path.join(__dirname, '..', 'assets', 'logo.png'); // 1000 x 499
const CARD_NOTICE = [
  'Your card is held on file and will not be charged until after the work is complete. Without a card on file we cannot book the service.',
  'You will receive a text link to securely fill in your credit card information.',
];

const money = (n) => '$' + Number(n).toLocaleString('en-US');

// data: { price|null, address, sqft|null, customer: { name, phone, email }, services: [{ name, notes }],
//         answers: { label: value }, nextStep, showCardNotice }
function buildQuotePdf(data) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margin: 54, info: { Title: 'Service Quote', Author: 'Spotless Gutters & Exterior Cleaning' } });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const L = 54;
    const W = doc.page.width - 2 * L;
    const bottom = doc.page.height - 54;
    const green = '#1f6f4a';
    const grey = '#5d6a63';
    const ink = '#1c2420';
    // start a new page if the next block would run off this one
    const room = (h) => { if (doc.y + h > bottom) { doc.addPage(); doc.y = 54; } };

    // header: logo on the left, title and date on the right
    const logoW = 180;
    const logoH = logoW * 499 / 1000;
    doc.image(LOGO, L, 44, { width: logoW });
    doc.fillColor(ink).font('Helvetica-Bold').fontSize(20).text('Service Quote', L, 62, { width: W, align: 'right' });
    doc.fillColor(grey).font('Helvetica').fontSize(11).text(new Date().toLocaleDateString('en-US', { timeZone: 'America/New_York', year: 'numeric', month: 'long', day: 'numeric' }), L, 88, { width: W, align: 'right' });
    doc.y = 44 + logoH + 12;
    doc.moveTo(L, doc.y).lineTo(L + W, doc.y).strokeColor('#dbe2de').lineWidth(1).stroke();
    doc.moveDown(0.9);

    const row = (label, value) => {
      if (!value) return;
      room(40);
      doc.fillColor(grey).font('Helvetica').fontSize(9.5).text(label.toUpperCase(), L, doc.y);
      doc.fillColor(ink).font('Helvetica').fontSize(13).text(value, L, doc.y);
      doc.moveDown(0.5);
    };
    const c = data.customer || {};
    row('Prepared for', c.name);
    row('Phone', c.phone);
    row('Email', c.email);
    row('Property', data.address);
    row('Home size', data.sqft ? `${Number(data.sqft).toLocaleString('en-US')} sq ft` : '');

    // services requested, each with its notes
    const services = data.services || [];
    if (services.length) {
      doc.moveDown(0.3);
      room(40);
      doc.fillColor(grey).font('Helvetica-Bold').fontSize(10.5).text('SERVICES REQUESTED', L, doc.y);
      doc.moveDown(0.3);
      services.forEach((s) => {
        room(34);
        doc.fillColor(ink).font('Helvetica-Bold').fontSize(13).text(s.name, L, doc.y);
        if (s.notes) {
          doc.fillColor(ink).font('Helvetica').fontSize(11.5).text(`Notes: ${s.notes}`, L + 12, doc.y, { width: W - 12 });
        }
        doc.moveDown(0.45);
      });
      doc.moveDown(0.2);
    }

    if (data.price != null) {
      room(110);
      const y = doc.y;
      doc.roundedRect(L, y, W, 84, 8).fillColor('#eef2ef').fill();
      doc.fillColor(grey).font('Helvetica').fontSize(10.5).text('GUTTER CLEANING', L + 16, y + 12);
      doc.fillColor(green).font('Helvetica-Bold').fontSize(38).text(money(data.price), L + 16, y + 28);
      doc.y = y + 84 + 16;

      const answers = data.answers || {};
      const keys = Object.keys(answers).filter((k) => answers[k]);
      if (keys.length) {
        room(30 + keys.length * 16);
        doc.fillColor(grey).font('Helvetica-Bold').fontSize(10.5).text('GUTTER CLEANING DETAILS', L, doc.y);
        doc.moveDown(0.3);
        keys.forEach((k) => {
          doc.fillColor(ink).font('Helvetica').fontSize(12).text(`${k}: ${answers[k]}`, L, doc.y);
        });
        doc.moveDown(0.8);
      }
    }

    if (data.nextStep) {
      room(50);
      doc.fillColor(grey).font('Helvetica-Bold').fontSize(10.5).text('NEXT STEP', L, doc.y);
      doc.moveDown(0.2);
      doc.fillColor(ink).font('Helvetica').fontSize(13).text(data.nextStep, L, doc.y);
      doc.moveDown(0.8);
    }

    // card notice: only on approved estimates; the box is sized to its text
    if (data.showCardNotice) {
      const pad = 14;
      const inner = W - 2 * pad;
      doc.font('Helvetica-Bold').fontSize(13);
      const h1 = doc.heightOfString('Credit card info', { width: inner });
      doc.font('Helvetica').fontSize(11.5);
      const h2 = doc.heightOfString(CARD_NOTICE[0], { width: inner });
      doc.font('Helvetica-Bold').fontSize(11.5);
      const h3 = doc.heightOfString(CARD_NOTICE[1], { width: inner });
      const boxH = pad + h1 + 6 + h2 + 8 + h3 + pad;
      room(boxH + 4);
      const by = doc.y;
      doc.roundedRect(L, by, W, boxH, 8).lineWidth(1).strokeColor('#dbe2de').stroke();
      let ty = by + pad;
      doc.fillColor(ink).font('Helvetica-Bold').fontSize(13).text('Credit card info', L + pad, ty, { width: inner });
      ty += h1 + 6;
      doc.font('Helvetica').fontSize(11.5).text(CARD_NOTICE[0], L + pad, ty, { width: inner });
      ty += h2 + 8;
      doc.font('Helvetica-Bold').fontSize(11.5).text(CARD_NOTICE[1], L + pad, ty, { width: inner });
    }
    doc.end();
  });
}

module.exports = { buildQuotePdf };
