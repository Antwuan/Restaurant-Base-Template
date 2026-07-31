#!/usr/bin/env node
/**
 * scripts/createRestaurant.js
 *
 * Onboarding script: adds a new restaurant to Supabase and generates
 * a config file from the template.
 *
 * Usage:
 *   node scripts/createRestaurant.js \
 *     --name "Pizza Palace" \
 *     --slug "pizza-palace" \
 *     --phone "+1 555-123-4567" \
 *     --email "hello@pizzapalace.com" \
 *     --address "123 Main St, Springfield, IL 62701" \
 *     --notification-email "orders@pizzapalace.com"
 *
 * Prerequisites:
 *   npm install @supabase/supabase-js dotenv minimist fs-extra
 *   .env must contain EXPO_PUBLIC_SUPABASE_URL and a SERVICE_ROLE_KEY
 *   (the anon key cannot INSERT into restricted tables — use service role for scripts)
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import minimist from 'minimist';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ─── Resolve __dirname in ESM ────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── Parse CLI args ───────────────────────────────────────────────────────────
const argv = minimist(process.argv.slice(2), {
  string: ['name', 'slug', 'phone', 'email', 'address', 'notification-email', 'domain'],
  boolean: ['help'],
  alias: { h: 'help' },
});

if (argv.help || !argv.name || !argv.slug) {
  console.log(`
Usage: node scripts/createRestaurant.js [options]

Required:
  --name              Restaurant display name  (e.g. "Pizza Palace")
  --slug              URL-safe slug            (e.g. "pizza-palace")

Optional:
  --phone             Phone number             (e.g. "+1 555-123-4567")
  --email             Contact email            (e.g. "hello@pizzapalace.com")
  --address           Street address           (e.g. "123 Main St, Springfield")
  --notification-email  Email to receive new order alerts
  --domain            Production domain        (e.g. "order.pizzapalace.com")
  -h, --help          Show this help message
`);
  process.exit(0);
}

// ─── Validate slug format ─────────────────────────────────────────────────────
if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(argv.slug)) {
  console.error('❌  --slug must be lowercase letters, numbers, and hyphens only (e.g. "pizza-palace")');
  process.exit(1);
}

// ─── Supabase client (service role — scripts only, never ship to client) ─────
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error(
    '❌  Missing environment variables.\n' +
    '    Ensure .env contains:\n' +
    '      EXPO_PUBLIC_SUPABASE_URL\n' +
    '      SUPABASE_SERVICE_ROLE_KEY\n' +
    '    (Find the service role key in Supabase Dashboard > Settings > API)'
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

// ─── Generate a simple default color palette ──────────────────────────────────
function generateColors() {
  const palettes = [
    { primary: '#007AFF', secondary: '#5856D6' }, // blue / indigo  (default)
    { primary: '#34C759', secondary: '#30B0C7' }, // green / teal
    { primary: '#FF3B30', secondary: '#FF9500' }, // red / orange
    { primary: '#AF52DE', secondary: '#FF2D55' }, // purple / pink
    { primary: '#FF9500', secondary: '#FFCC00' }, // orange / yellow
  ];
  return palettes[Math.floor(Math.random() * palettes.length)];
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const colors = generateColors();

  const restaurantData = {
    name: argv.name,
    slug: argv.slug,
    phone: argv.phone || null,
    email: argv.email || null,
    address: argv.address || null,
    notification_email: argv['notification-email'] || null,
    notification_phone: null,           // reserved for future SMS
    domain: argv.domain || null,
    primary_color: colors.primary,
    secondary_color: colors.secondary,
    is_accepting_orders: true,
  };

  console.log('\n🍽️  Creating restaurant...\n');
  console.log('  Name:               ', restaurantData.name);
  console.log('  Slug:               ', restaurantData.slug);
  console.log('  Domain:             ', restaurantData.domain ?? '(none — slug-based routing)');
  console.log('  Notification email: ', restaurantData.notification_email ?? '(none set)');
  console.log('  Primary color:      ', restaurantData.primary_color);
  console.log('  Secondary color:    ', restaurantData.secondary_color);
  console.log('');

  // ── Insert into Supabase ───────────────────────────────────────────────────
  const { data, error } = await supabase
    .from('restaurants')
    .insert(restaurantData)
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      console.error(`❌  A restaurant with slug "${argv.slug}" already exists.`);
    } else {
      console.error('❌  Supabase insert failed:', error.message);
    }
    process.exit(1);
  }

  console.log(`✅  Restaurant created in Supabase (id: ${data.id})\n`);

  // ── Generate config file from template ────────────────────────────────────
  const configDir = path.join(__dirname, '..', 'src', 'config', 'restaurants');
  const configPath = path.join(configDir, `${argv.slug}.js`);

  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  const configContent = `/**
 * Auto-generated by scripts/createRestaurant.js
 * Restaurant: ${data.name}
 * Created:    ${new Date().toISOString()}
 *
 * Import this file in your mobile app build for ${data.name}.
 * Web builds detect the restaurant automatically via hostname / query param.
 */

const restaurantConfig = {
  restaurantId: '${data.id}',
  slug: '${data.slug}',
  domain: ${data.domain ? `'${data.domain}'` : 'null'},
};

export default restaurantConfig;
`;

  fs.writeFileSync(configPath, configContent, 'utf8');
  console.log(`📄  Config file written to: src/config/restaurants/${argv.slug}.js\n`);

  // ── Print next steps ───────────────────────────────────────────────────────
  console.log('─'.repeat(60));
  console.log('📋  Next steps:\n');
  console.log(`  1. Add menu categories for this restaurant in Supabase:`);
  console.log(`       Table: menu_categories  |  restaurant_id: ${data.id}\n`);
  console.log(`  2. Add menu items under each category.\n`);
  console.log(`  3. Connect a Stripe account:`);
  console.log(`       Update restaurants.stripe_account_id for id: ${data.id}\n`);
  console.log(`  4. Set up Resend sending domain (Admin → Settings → Transactional email):`);
  console.log(`       Create subdomain (e.g. mail.${argv.domain || argv.slug + '.com'}), add DNS, Verify.`);
  console.log(`       Required before order / marketing / review emails send.\n`);
  if (!data.notification_email) {
    console.log(`  5. ⚠️  No notification_email set — optional staff alert address.`);
    console.log(`       Update it in Supabase or re-run with --notification-email.\n`);
  } else {
    console.log(`  5. Staff notification email: ${data.notification_email}\n`);
  }
  if (data.domain) {
    console.log(`  6. Configure DNS for ${data.domain}:`);
    console.log(`       Add a CNAME record pointing to your Vercel deployment.\n`);
  }
  console.log('─'.repeat(60));
  console.log('');
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});