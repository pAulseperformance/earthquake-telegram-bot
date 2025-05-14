// Handler for AWS Lambda
const { fetchAndNotify } = require('./dist/index');

exports.handler = async (event) => {
  try {
    await fetchAndNotify();
    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Earthquake notification process completed successfully' })
    };
  } catch (error) {
    console.error('Error in Lambda function:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Error processing earthquake notifications', error: error.message })
    };
  }
};
