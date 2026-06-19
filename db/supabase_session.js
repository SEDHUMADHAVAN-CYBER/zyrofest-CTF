const session = require('express-session');

class SupabaseStore extends session.Store {
  constructor(options = {}) {
    super(options);
    this.supabase = options.client;
    if (!this.supabase) {
      throw new Error('A Supabase client must be provided to SupabaseStore');
    }
    this.tableName = options.tableName || 'session';
  }

  async get(sid, callback) {
    try {
      const { data, error } = await this.supabase
        .from(this.tableName)
        .select('sess, expire')
        .eq('sid', sid)
        .single();

      if (error) return callback(null, null); // Treat all errors as "not found"

      if (!data) return callback(null, null);

      if (new Date(data.expire) < new Date()) {
        await this.destroy(sid, () => {});
        return callback(null, null);
      }

      callback(null, data.sess);
    } catch (err) {
      callback(null, null); // Never fail hard on session read
    }
  }

  async set(sid, sess, callback) {
    try {
      let expire;
      if (sess.cookie && sess.cookie.expires) {
        expire = new Date(sess.cookie.expires);
      } else {
        expire = new Date(Date.now() + 86400000); // 1 day default
      }

      await this.supabase
        .from(this.tableName)
        .upsert([{ sid, sess, expire }], { onConflict: 'sid' });

      callback(null);
    } catch (err) {
      callback(null); // Don't crash if session save fails
    }
  }

  async destroy(sid, callback) {
    try {
      await this.supabase.from(this.tableName).delete().eq('sid', sid);
      callback(null);
    } catch (err) {
      callback(null);
    }
  }

  async touch(sid, sess, callback) {
    try {
      let expire = sess.cookie?.expires
        ? new Date(sess.cookie.expires)
        : new Date(Date.now() + 86400000);
      await this.supabase.from(this.tableName).update({ expire }).eq('sid', sid);
      callback(null);
    } catch (err) {
      callback(null);
    }
  }
}

module.exports = SupabaseStore;
