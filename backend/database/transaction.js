/** Hold one client for the entire transaction and always release it. */
export async function withTransaction(pool,work,{signal}={}){
  signal?.throwIfAborted();const client=await pool.connect();
  try{signal?.throwIfAborted();await client.query('BEGIN');const result=await work(client);signal?.throwIfAborted();await client.query('COMMIT');return result;}
  catch(error){try{await client.query('ROLLBACK');}catch{ /* Preserve the original failure. */ }throw error;}
  finally{client.release();}
}
