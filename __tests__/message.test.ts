import {
  fechaImap,
  parsearRespuestaFetch,
  separarHeadersYCuerpo,
} from '../supabase/functions/_shared/message';

describe('separarHeadersYCuerpo', () => {
  it('separa encabezados del cuerpo', () => {
    const crudo = 'From: a@b.com\r\nSubject: Hola\r\n\r\nCuerpo del mensaje';
    const { headers, body } = separarHeadersYCuerpo(crudo);
    expect(headers.from).toBe('a@b.com');
    expect(headers.subject).toBe('Hola');
    expect(body).toBe('Cuerpo del mensaje');
  });

  it('normaliza los nombres de encabezado a minúsculas', () => {
    const { headers } = separarHeadersYCuerpo('MESSAGE-ID: <x@y>\r\n\r\n');
    expect(headers['message-id']).toBe('<x@y>');
  });

  it('despliega encabezados continuados en varias líneas', () => {
    const crudo = 'Subject: Comprobante de\r\n\ttransferencia SINPE\r\n\r\ncuerpo';
    const { headers } = separarHeadersYCuerpo(crudo);
    expect(headers.subject).toBe('Comprobante de transferencia SINPE');
  });

  it('tolera un mensaje sin cuerpo', () => {
    const { headers, body } = separarHeadersYCuerpo('From: a@b.com');
    expect(headers.from).toBe('a@b.com');
    expect(body).toBe('');
  });

  it('conserva los dos puntos que aparecen dentro del valor', () => {
    const { headers } = separarHeadersYCuerpo('Subject: Aviso: transferencia\r\n\r\n');
    expect(headers.subject).toBe('Aviso: transferencia');
  });
});

describe('parsearRespuestaFetch', () => {
  it('extrae uid, encabezados y cuerpo', () => {
    const lineas = [
      '* 1 FETCH (UID 42 BODY[] \r\nFrom: bcr@bancobcr.com\r\nSubject: SINPE\r\n\r\nMonto',
      'A0001 OK FETCH completed',
    ];
    const [msg] = parsearRespuestaFetch(lineas);
    expect(msg.uid).toBe(42);
    expect(msg.headers.from).toBe('bcr@bancobcr.com');
    expect(msg.body).toBe('Monto');
  });

  it('ignora las líneas que no son FETCH', () => {
    expect(parsearRespuestaFetch(['A0001 OK FETCH completed'])).toEqual([]);
  });

  it('devuelve varios mensajes', () => {
    const linea = (uid: number) =>
      `* ${uid} FETCH (UID ${uid} BODY[] \r\nFrom: a@b.com\r\n\r\ncuerpo${uid}`;
    const msgs = parsearRespuestaFetch([linea(7), linea(8), 'A0001 OK']);
    expect(msgs.map((m) => m.uid)).toEqual([7, 8]);
    expect(msgs[1].body).toBe('cuerpo8');
  });
});

describe('fechaImap', () => {
  it('usa el formato DD-Mon-YYYY', () => {
    expect(fechaImap(new Date('2026-08-20T00:00:00Z'))).toBe('20-Aug-2026');
  });

  it('rellena el día con cero a la izquierda', () => {
    expect(fechaImap(new Date('2026-01-05T00:00:00Z'))).toBe('05-Jan-2026');
  });

  it('traduce diciembre correctamente', () => {
    expect(fechaImap(new Date('2026-12-31T00:00:00Z'))).toBe('31-Dec-2026');
  });
});
