// Discord Webhook Client
// Sends rich embed messages to Discord channels via webhooks

/**
 * Send an alert to a Discord webhook
 * @param {string} webhookUrl - Discord webhook URL
 * @param {Object} alert - Alert object with message details
 * @param {Object} config - Webhook configuration
 * @returns {Promise<Object>} Response object with success status
 */
export async function sendDiscordAlert(webhookUrl, alert, config = {}) {
  try {
    // Build Discord embed
    const embed = {
      title: alert.title,
      description: alert.description,
      color: alert.color || 0x0099FF,
      timestamp: new Date().toISOString(),
      fields: [],
      footer: {
        text: 'Inside-Out Monitor'
      }
    };

    // Add alert-specific fields
    if (alert.fields) {
      embed.fields = alert.fields.map(field => ({
        name: field.name,
        value: field.value,
        inline: field.inline || false
      }));
    }

    // Add device/target information
    if (alert.entity_name) {
      embed.fields.push({
        name: alert.entity_type === 'device' ? 'Device' : 'Target',
        value: alert.entity_name,
        inline: true
      });
    }

    // Add last seen time
    if (alert.last_seen) {
      const lastSeenDate = new Date(alert.last_seen * 1000);
      embed.fields.push({
        name: 'Last Seen',
        value: lastSeenDate.toLocaleString(),
        inline: true
      });
    }

    // Add response time for ping targets
    if (alert.response_time_ms !== undefined && alert.response_time_ms !== null) {
      embed.fields.push({
        name: 'Response Time',
        value: `${alert.response_time_ms.toFixed(2)} ms`,
        inline: true
      });
    }

    // Build webhook payload
    const payload = {
      embeds: [embed]
    };

    // Add mentions if configured
    if (config.mentions && config.mentions.length > 0) {
      payload.content = config.mentions.join(' ');
    }

    // Send webhook request
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Discord API error (${response.status}): ${errorText}`);
    }

    return {
      success: true,
      webhook_type: 'discord',
      webhook_name: config.name || 'Unknown'
    };

  } catch (error) {
    console.error(`Discord webhook error:`, error.message);
    return {
      success: false,
      webhook_type: 'discord',
      webhook_name: config.name || 'Unknown',
      error: error.message
    };
  }
}

/**
 * Test a Discord webhook configuration
 * @param {string} webhookUrl - Discord webhook URL
 * @param {Object} config - Webhook configuration
 * @returns {Promise<Object>} Test result
 */
export async function testDiscordWebhook(webhookUrl, config = {}) {
  const testAlert = {
    title: '✅ Discord Webhook Test',
    description: 'This is a test message from Inside-Out Monitor alerting system.',
    color: 0x0099FF,
    fields: [
      {
        name: 'Status',
        value: 'Webhook is working correctly',
        inline: false
      }
    ]
  };

  return await sendDiscordAlert(webhookUrl, testAlert, config);
}
