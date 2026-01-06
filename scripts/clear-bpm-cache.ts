#!/usr/bin/env tsx
/**
 * Script to clear all BPM cache data
 * Run with: pnpm tsx scripts/clear-bpm-cache.ts
 */

import { query } from '../lib/db'

async function clearBpmCache() {
  try {
    console.log('Clearing BPM cache...')
    
    // Delete all records
    const result = await query('DELETE FROM track_bpm_cache')
    
    // Reset the sequence
    await query('ALTER SEQUENCE track_bpm_cache_id_seq RESTART WITH 1')
    
    console.log('✅ BPM cache cleared successfully!')
    console.log(`   Deleted records: ${result.length}`)
  } catch (error) {
    console.error('❌ Error clearing BPM cache:', error)
    process.exit(1)
  }
}

clearBpmCache()

