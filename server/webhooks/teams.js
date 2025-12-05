// Microsoft Teams Webhook Client
// Sends Adaptive Card messages to Teams channels via webhooks

/**
 * Send an alert to a Microsoft Teams webhook
 * @param {string} webhookUrl - Teams webhook URL
 * @param {Object} alert - Alert object with message details
 * @param {Object} config - Webhook configuration
 * @returns {Promise<Object>} Response object with success status
 */
export async function sendTeamsAlert(webhookUrl, alert, config = {}) {
  try {
    // Determine theme color based on event type or severity
    let themeColor = '0078D4'; // Default blue
    if (alert.color) {
      themeColor = alert.color.toString(16).padStart(6, '0');
    } else if (config.severity === 'critical' || alert.event_type === 'offline') {
      themeColor = 'FF0000'; // Red
    } else if (alert.event_type === 'online') {
      themeColor = '00FF00'; // Green
    }

    // Build facts array for the card
    const facts = [];

    if (alert.entity_name) {
      facts.push({
        name: alert.entity_type === 'device' ? 'Device:' : 'Target:',
        value: alert.entity_name
      });
    }

    if (alert.last_seen) {
      const lastSeenDate = new Date(alert.last_seen * 1000);
      facts.push({
        name: 'Last Seen:',
        value: lastSeenDate.toLocaleString()
      });
    }

    if (alert.response_time_ms !== undefined && alert.response_time_ms !== null) {
      facts.push({
        name: 'Response Time:',
        value: `${alert.response_time_ms.toFixed(2)} ms`
      });
    }

    // Add custom fields from alert
    if (alert.fields) {
      alert.fields.forEach(field => {
        facts.push({
          name: `${field.name}:`,
          value: field.value
        });
      });
    }

    // Build MessageCard payload (legacy format, widely supported)
    const payload = {
      '@type': 'MessageCard',
      '@context': 'https://schema.org/extensions',
      themeColor: themeColor,
      summary: alert.title,
      sections: [
        {
          activityTitle: alert.title,
          activitySubtitle: 'Inside-Out Monitor',
          facts: facts,
          text: alert.description
        }
      ]
    };

    // Add potential actions (optional)
    // Uncomment if you want to add buttons to view device in dashboard
    // if (alert.dashboard_url) {
    //   payload.potentialAction = [
    //     {
    //       '@type': 'OpenUri',
    //       name: 'View in Dashboard',
    //       targets: [
    //         {
    //           os: 'default',
    //           uri: alert.dashboard_url
    //         }
    //       ]
    //     }
    //   ];
    // }

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
      throw new Error(`Teams API error (${response.status}): ${errorText}`);
    }

    return {
      success: true,
      webhook_type: 'teams',
      webhook_name: config.name || 'Unknown'
    };

  } catch (error) {
    console.error(`Teams webhook error:`, error.message);
    return {
      success: false,
      webhook_type: 'teams',
      webhook_name: config.name || 'Unknown',
      error: error.message
    };
  }
}

/**
 * Test a Microsoft Teams webhook configuration
 * @param {string} webhookUrl - Teams webhook URL
 * @param {Object} config - Webhook configuration
 * @returns {Promise<Object>} Test result
 */
export async function testTeamsWebhook(webhookUrl, config = {}) {
  const testAlert = {
    title: '✅ Teams Webhook Test',
    description: 'This is a test message from Inside-Out Monitor alerting system.',
    color: 0x0099FF,
    fields: [
      {
        name: 'Status',
        value: 'Webhook is working correctly'
      }
    ]
  };

  return await sendTeamsAlert(webhookUrl, testAlert, config);
}
