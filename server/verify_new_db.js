import pg from "pg";

const { Client } = pg;
const NEW_DATABASE_URL = process.env.NEW_DATABASE_URL;

if (!NEW_DATABASE_URL) {
  console.error("Error: Please set the NEW_DATABASE_URL environment variable first.");
  process.exit(1);
}

async function verify() {
  const client = new Client({
    connectionString: NEW_DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  
  try {
    await client.connect();
    console.log("Connected to your NEW Neon database successfully!\n");
    
    // Check total sales count
    const countRes = await client.query("SELECT COUNT(*) as count FROM sales");
    console.log(`Total Sales in Neon Database: ${countRes.rows[0].count}`);
    
    // Get the 3 most recent sales
    const recentRes = await client.query(`
      SELECT s.id, s.property_name, s.sale_date, s.total_amount, p.name as seller_name
      FROM sales s
      LEFT JOIN people p ON s.seller_id = p.id
      ORDER BY s.sale_date DESC
      LIMIT 3
    `);
    
    console.log("\nMost Recent Sales in Neon Database:");
    console.log("----------------------------------");
    recentRes.rows.forEach((row, index) => {
      console.log(`${index + 1}. Date: ${row.sale_date} | Property: ${row.property_name} | Amount: ${row.total_amount} | Seller: ${row.seller_name}`);
    });
    
  } catch (err) {
    console.error("Failed to connect or query database:", err);
  } finally {
    await client.end();
  }
}

verify();
