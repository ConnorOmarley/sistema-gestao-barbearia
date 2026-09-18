import { existsSync, writeFileSync, unlinkSync } from 'fs';
import { join, basename } from 'path';
export function registerPhotoRoutes(app, getOne, change, perfilDir) {
app.post('/api/barbeiros/:id/foto', (req, res) => {
  const barbeiro = getOne('SELECT * FROM barbeiros WHERE id = ? AND ativo = 1', [req.params.id]);
  if (!barbeiro) {
    return res.status(404).json({ error: 'Barbeiro não encontrado' });
  }

  const { foto } = req.body;
  if (!foto || typeof foto !== 'string') {
    return res.status(400).json({ error: 'Imagem não enviada.' });
  }

  const match = foto.match(/^data:image\/(png|jpeg|jpg|webp|gif);base64,(.+)$/);
  if (!match) {
    return res.status(400).json({ error: 'Formato de imagem inválido. Use PNG, JPG, WEBP ou GIF.' });
  }

  const ext = match[1] === 'jpg' ? 'jpg' : match[1];
  const dados = Buffer.from(match[2], 'base64');
  if (dados.length > 1024 * 1024) {
    return res.status(400).json({ error: 'A imagem é muito grande. Máximo 1MB.' });
  }

  const nomeArquivo = `barbeiro_${barbeiro.id}_${Date.now()}.${ext}`;
  const caminho = join(perfilDir, nomeArquivo);
  writeFileSync(caminho, dados);

  change('UPDATE barbeiros SET foto = ? WHERE id = ?', [`assets/perfil/${nomeArquivo}`, barbeiro.id]);
  if (barbeiro.foto) {
    const antiga = join(perfilDir, basename(barbeiro.foto));
    if (existsSync(antiga) && antiga !== caminho) {
      try { unlinkSync(antiga); } catch (e) {}
    }
  }

  change('UPDATE barbeiros SET foto = ? WHERE id = ?', [`assets/perfil/${nomeArquivo}`, barbeiro.id]);

  res.json({ foto: `assets/perfil/${nomeArquivo}` });
});

app.delete('/api/barbeiros/:id/foto', (req, res) => {
  const barbeiro = getOne('SELECT * FROM barbeiros WHERE id = ? AND ativo = 1', [req.params.id]);
  if (!barbeiro) {
    return res.status(404).json({ error: 'Barbeiro não encontrado' });
  }

  change('UPDATE barbeiros SET foto = NULL WHERE id = ?', [barbeiro.id]);
  if (barbeiro.foto) {
    const arquivo = join(perfilDir, basename(barbeiro.foto));
    if (existsSync(arquivo)) {
      try { unlinkSync(arquivo); } catch (e) {}
    }
  }



  res.json({ foto: null });
});


}
