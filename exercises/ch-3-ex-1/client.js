var express = require("express");
var request = require("sync-request");
var url = require("url");
var qs = require("qs");
var querystring = require('querystring');
var cons = require('consolidate');
var randomstring = require("randomstring");
var __ = require('underscore');
__.string = require('underscore.string');

var app = express();

app.engine('html', cons.underscore);
app.set('view engine', 'html');
app.set('views', 'files/client');

// authorization server information
var authServer = {
	authorizationEndpoint: 'http://localhost:9001/authorize',
	tokenEndpoint: 'http://localhost:9001/token'
};

// client information


/*
 * Add the client information in here
 */
var client = {
	"client_id": "oauth-client-1",
	"client_secret": "oauth-client-secret-1",
	"redirect_uris": ["http://localhost:9000/callback"]
};

var protectedResource = 'http://localhost:9002/resource';

var state = null;

var access_token = null;
var scope = null;

app.get('/', function (req, res) {
	res.render('index', { access_token: access_token, scope: scope });
});

app.get('/authorize', function (req, res) {
	/*
	 * Send the user to the authorization server
	 */

	// access_tokenをリセット
	access_token = null;

	// 
	state = randomstring.generate();

	let authorizeUrl = buildUrl(authServer.authorizationEndpoint, {
		response_type: 'code',
		client_id: client.client_id,
		redirect_uri: client.redirect_uris[0],
		state: state
	});


	res.redirect(authorizeUrl);
});

app.get('/callback', function (req, res) {
	/*
	 * Parse the response from the authorization server and get a token
	 */

	// 正常に認可サーバーから呼び出されているかチェックする
	if (req.query.state != state) {
		res.render('error', {
			error: 'State value did not match'
		});
		return;
	}


	let code = req.query.code;

	let form_data = qs.stringify({
		grant_type: 'authorization_code',
		code: code,
		redirect_uri: client.redirect_uris[0]
	});

	let headers = {
		'Content-Type': 'application/x-www-form-urlencoded',
		'Authorization': 'Basic ' + encodeClientCredentials(client.client_id, client.client_secret)
	};

	let tokRes = request('POST', authServer.tokenEndpoint,
		{
			body: form_data,
			headers: headers
		}
	);

	if (tokRes.statusCode >= 200 && tokRes.statusCode < 300) {
		var body = JSON.parse(tokRes.getBody());

		access_token = body.access_token;
		console.log('Got access token: %s', access_token);

		res.render('index', { access_token: access_token, scope: scope });
	} else {
		res.render('error', { error: 'Unable to fetch access token, server response: ' + tokRes.statusCode })
	}

});

app.get('/fetch_resource', function (req, res) {

	/*
	 * Use the access token to call the resource server
	 */

	if (!access_token) {
		res.render('error', {
			error: 'Missing access token.'
		});
		return;
	}

	let headers = {
		'Authorization': 'Bearer ' + access_token
	};
	// 保護対象リソースの呼び出し
	let resource = request('POST', protectedResource, {
		headers: headers
	});

	if (resource.statusCode >= 200 && resource.statusCode < 300) {
		let body = JSON.parse(resource.getBody());

		res.render('data', {
			resource: body
		});
		return;
	} else {
		res.render('error', {
			error: 'Server returned response code: ' + resource.statusCode
		});
		return;
	}
});

var buildUrl = function (base, options, hash) {
	var newUrl = url.parse(base, true);
	delete newUrl.search;
	if (!newUrl.query) {
		newUrl.query = {};
	}
	__.each(options, function (value, key, list) {
		newUrl.query[key] = value;
	});
	if (hash) {
		newUrl.hash = hash;
	}

	return url.format(newUrl);
};

var encodeClientCredentials = function (clientId, clientSecret) {
	return Buffer.from(querystring.escape(clientId) + ':' + querystring.escape(clientSecret)).toString('base64');
};

app.use('/', express.static('files/client'));

var server = app.listen(9000, 'localhost', function () {
	var host = server.address().address;
	var port = server.address().port;
	console.log('OAuth Client is listening at http://%s:%s', host, port);
});

