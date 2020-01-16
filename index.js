// Connection string 
// ssh -i ~/.ssh/do_again root@206.189.126.3

const util = require('util');
var app = require('express')();
const fs = require('fs');
var http = require('http').Server(app);
var bodyParser = require('body-parser');
var mongoose = require('mongoose');

var version = '1010';

var mongoDB = 'mongodb://localhost:27017/aryzon';
mongoose.connect(mongoDB);
var db = mongoose.connection;
var Schema = mongoose.Schema;
var cc = mongoose.model('codes', new Schema({},{ "strict": false }));

app.use(bodyParser.raw({limit: '100mb'}));
app.use(bodyParser.json({limit: '100mb'}));
app.use(bodyParser.urlencoded({limit: '100mb', extended: true }));

function randomIntFromInterval(min,max)
{
    return Math.floor(Math.random()*(max-min+1)+min);
}

function generateRandomCode() {
    var CHARS = 10;
    var cod = "";

    for ( var q = 0; q < CHARS+1; q++ ) {
      if ( q == CHARS/2 ) {
        cod += "-";
        continue;
      }
      if ( Math.random() > 0.5 ) {              
          cod += String.fromCharCode( randomIntFromInterval(65,90) );
      } else {
          cod += String.fromCharCode( randomIntFromInterval(48,57) );
      }
    }

    return cod;
}

app.get('/', function(req, res){
  res.sendFile(__dirname + '/index.html');
});

app.get('/generate/:quantity', function(req, res) {

  var codeGenerated = 0;

  while ( codeGenerated < req.params.quantity ) {
    var newcode = generateRandomCode();
    cc.findOne({ code : newcode }, function (err, entry) {
      if (err) {
        handleError(err);
      } else {
        if ( entry ) {
          //res.send('code in there already: ' + newcode );        
        } else {
          var codeentry = new cc( {code : newcode, downloaded : false, used: false, used_case: "", date_downloaded: -1, date_used: -1} );
          codeentry.save();
        }
      }
    });
    codeGenerated++;
  }

  res.send('Codes Generated: ' + codeGenerated);

});

app.get('/reset', function(req, res){
  db.collection('codes').updateMany({}, { $set: { "downloaded" : false, "used" : false, "use_case" : "", "date_downloaded" : -1, "date_used" : -1 }}, function (err, entry) {
    if (err) {
      handleError(err);
    } else {
      res.send('All codes reset' );
    }
  });   
});

async function ctoArray( cursor ) {
  var ret = await cursor.toArray();
  return ret;
}

function downloadCodes ( name, quantity, res ) {
  var tn = Date.now();
  var updatedIndex = 0;
  var codes = "";

  db.collection('codes').find( { 'code' : { '$regex' : /([^O0o]|-){11}/, '$options' : 'i' }, "downloaded" : false } ).limit(quantity).forEach(function (elem) { 
      elem.downloaded = true; 
      elem.use_case = name;
      elem.date_downloaded = tn;
      updatedIndex++;
      db.collection('codes').save(elem); 
      codes += elem.code + "\n";
      if ( updatedIndex == quantity ) {
        var filename = name +  '_promocodes.txt';
        fs.writeFile(filename, codes, function(err) {
          if (err) {
            res.send('Something when wrong');
          } else {
            res.download(filename);
          }
        })
      }
    }.bind(updatedIndex).bind(codes).bind(quantity).bind(name)
  );
}

app.get('/download/:name/:quantity', function(req, res){
  // var cursor = db.collection('codes').findAndModify( { query : { "downloaded" : false }, 
  //                                                      update: { $set : { "downloaded" : true, "use_case" : req.params.name, "date_downloaded" : tn } } }
  //                                                  ).limit(parseInt(req.params.quantity));
  if ( isNaN(req.params.quantity) ) {
    res.send('GamerSan that is and invalid number');
    return;
  }

  var quantity = parseInt(req.params.quantity);
  if ( quantity > 10 ) {
    res.send('GamerSan that is too big, dont be silly, but I know it was just a mistake...');
    return;
  }

  var name = req.params.name;  
  downloadCodes( name, quantity, res );

  console.log('Downloaded codes data: ${req.params.name}, ${req.params.quantity}');
  //res.sendFile(__dirname + '/index.html');  
});

app.get('/download/:name/:quantity/:forreal?', function(req, res){
  // var cursor = db.collection('codes').findAndModify( { query : { "downloaded" : false }, 
  //                                                      update: { $set : { "downloaded" : true, "use_case" : req.params.name, "date_downloaded" : tn } } }
  //                                                  ).limit(parseInt(req.params.quantity));
  if ( isNaN(req.params.quantity) ) {
    res.send('GamerSan that is and invalid number');
    return;
  }

  var name = req.params.name;  
  var quantity = parseInt(req.params.quantity);
  downloadCodes( name, quantity, res );

  console.log('Downloaded codes data: ${req.params.name}, ${req.params.quantity}');
  //res.sendFile(__dirname + '/index.html');  
});

app.get('/register_used/:code', function(req, res){
  var tn = Date.now();
  var code = req.params.code;
  db.collection('codes').findOneAndUpdate( { "code" : code, "used" : false }, 
                                           { $set : { "used" : true, "date_used" : tn } },
                                           ( err, doc ) => {  
                                             let result = (err || doc == null ) ? "error" : "ok";
                                             if ( doc && doc.value == null ) result = "error";
                                             res.send( { "result": result } ); 
                                           });
});

app.get('/list/:use_case', function(req, res){
  var use_case = req.params.use_case;
  var query = db.collection('codes').count( { "use_case" : use_case }, ( err, doc ) => {  
      if (err || doc == null ) {
        res.send( { "result": "error" } ); 
      } else {
        res.send( { "total": doc } ); 
        // //res.json( util.inspect(doc) );
        // let out = "";
        // // console.log(doc);
        // doc.forEach( myDoc => { out += "user: " + myDoc.code; } )
        // res.send( out );
      }
    });
});

app.get('/list/used/:use_case', function(req, res){
  var use_case = req.params.use_case;
  var query = db.collection('codes').count( { "use_case" : use_case, "used" : true }, ( err, doc ) => {  
      if (err || doc == null ) {
        res.send( { "result": "error" } ); 
      } else {
        res.send( { "total": doc } ); 
        // //res.json( util.inspect(doc) );
        // let out = "";
        // // console.log(doc);
        // doc.forEach( myDoc => { out += "user: " + myDoc.code; } )
        // res.send( out );
      }
    });
});

app.get('/overview', function(req, res){
  let ret = {};

  db.collection('codes').distinct( "use_case", function( err, doc) {
    if ( err ) {
      res.send( { "result": "error" } ); 
    } else {
      let countDone = 0;
      for ( let t = 0; t < doc.length; t++ ) {
        db.collection('codes').count( { "use_case" : doc[t] }, ( err, doc2 ) => {
          ret[doc[t]] = doc2;
          ++countDone;
          if ( countDone == doc.length ) {
            res.send(ret);
          }
        });
      }
    }
  });
});    

app.get('/query/:code/', function(req, res){
  var code = req.params.code;
  db.collection('codes').findOne( { "code" : code }, ( err, doc ) => {  
      if (err || doc == null ) {
        res.send( { "result": "Code doesn't exist/invalid" } );   
      } else {
        ddt = new Date(doc.date_downloaded);
        ddu = new Date(doc.date_used);
        const dd = ( doc.date_downloaded != -1 ) ? ddt.toUTCString() : "Never";
        const du = ( doc.date_used != -1 ) ? ddu.toUTCString() : "Never";
        const out = { "code": doc.code, "use case" : doc.use_case, "downloaded/printed":  dd, "used" : du }; 
        res.send( JSON.stringify(out) ); 
      }
    });
});

app.get('/use/:code', function(req, res){
  var code = req.params.code;
  db.collection('codes').findOne( { "downloaded" : true, "code" : code, "used" : false }, ( err, doc ) => {  
      let result = (err || doc == null ) ? "error" : "ok";
      res.send( { "result": result } ); 
    });
});

app.get('/version', function(req, res){
  res.send( { "version": version } ); 
});

var port = process.env.PORT || 3000;
http.listen(port, function(){
  console.log('listening on *:' + port);
});
