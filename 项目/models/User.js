const pool = require('../config/db');

class User {
  static async create(userData) {
    const { username, password, nickname, phone, email } = userData;
    const [result] = await pool.execute(
      'INSERT INTO users (username, password, nickname, phone, email) VALUES (?, ?, ?, ?, ?)',
      [username, password, nickname, phone, email]
    );
    return result.insertId;
  }

  static async findAll() {
    const [rows] = await pool.execute('SELECT * FROM users');
    return rows;
  }

  static async findById(id) {
    const [rows] = await pool.execute('SELECT * FROM users WHERE id = ?', [id]);
    return rows[0];
  }

  static async findByUsername(username) {
    const [rows] = await pool.execute('SELECT * FROM users WHERE username = ?', [username]);
    return rows[0];
  }

  static async update(id, userData) {
    const { nickname, phone, email } = userData;
    const [result] = await pool.execute(
      'UPDATE users SET nickname = ?, phone = ?, email = ? WHERE id = ?',
      [nickname, phone, email, id]
    );
    return result.affectedRows > 0;
  }

  static async delete(id) {
    const [result] = await pool.execute('DELETE FROM users WHERE id = ?', [id]);
    return result.affectedRows > 0;
  }
}

module.exports = User;
