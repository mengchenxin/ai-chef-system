const pool = require('../config/db');

class ConsultationRecord {
  static async create(recordData) {
    const { session_id, user_id, role, content, prescription } = recordData;
    const [result] = await pool.execute(
      'INSERT INTO consultation_records (session_id, user_id, role, content, prescription) VALUES (?, ?, ?, ?, ?)',
      [session_id, user_id, role, content, prescription]
    );
    return result.insertId;
  }

  static async findBySessionId(sessionId) {
    const [rows] = await pool.execute(
      'SELECT * FROM consultation_records WHERE session_id = ? ORDER BY created_at ASC',
      [sessionId]
    );
    return rows;
  }

  static async findByUserId(userId) {
    const [rows] = await pool.execute(
      'SELECT * FROM consultation_records WHERE user_id = ? ORDER BY created_at DESC',
      [userId]
    );
    return rows;
  }

  static async findAll() {
    const [rows] = await pool.execute('SELECT * FROM consultation_records ORDER BY created_at DESC');
    return rows;
  }

  static async findById(id) {
    const [rows] = await pool.execute('SELECT * FROM consultation_records WHERE id = ?', [id]);
    return rows[0];
  }

  static async update(id, recordData) {
    const { content, prescription } = recordData;
    const [result] = await pool.execute(
      'UPDATE consultation_records SET content = ?, prescription = ? WHERE id = ?',
      [content, prescription, id]
    );
    return result.affectedRows > 0;
  }

  static async delete(id) {
    const [result] = await pool.execute('DELETE FROM consultation_records WHERE id = ?', [id]);
    return result.affectedRows > 0;
  }

  static async deleteBySessionId(sessionId) {
    const [result] = await pool.execute('DELETE FROM consultation_records WHERE session_id = ?', [sessionId]);
    return result.affectedRows > 0;
  }
}

module.exports = ConsultationRecord;
