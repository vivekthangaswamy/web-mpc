const assert = require('assert');
const webdriver = require('selenium-webdriver');
const { By } = require('selenium-webdriver');
const expect = require('chai').expect;
const chrome = require('selenium-webdriver/chrome');
const path = require('chromedriver').path;

let sessionKey = null;
let sessionPassword = null;

const numberOfParticipants = 2;
const dataValue = 1;
const numberOfCohorts = 2;

const shortTimeout = 5000;
const medTimeout = 20000;
const longTimeout = 200000;
const participant_links = [];

function createDriver() {
  var service = new chrome.ServiceBuilder(path).build();
    chrome.setDefaultService(service);
  var driver = new webdriver.Builder()
    .forBrowser('chrome')
    .withCapabilities(webdriver.Capabilities.chrome())
    .build();

  return driver;
}

describe('End-to-end workflow tests', function() {
  var driver; 
  before(function() {
    driver = createDriver();
  });

  after(function() {
    driver.quit();
  });

  it('Basic end to end test with cohort self selection', async () => {
    await createSession(driver);
    await generateParticipantLinks(driver, 'null');
    await dataSubmission(driver);
    await closeSession(driver);
    // await unmaskData(driver);
  });    

  // - - - - - - - 
  // H E L P E R S
  // - - - - - - -
  function handleFailure(err, driver) {
    // driver.takeScreenshot();
    assert.fail('Error: ' + err)
    driver.quit();
  }
  
  function getUserHome() {
    return process.env.HOME || process.env.USERPROFILE;
  }

  async function createSession(driver) {
    try {
      // create session
      await driver.get('localhost:8080/create').then(async function() {
        await driver.wait(async function() {
          const title = driver.findElement(By.id('session-title'));
          const desc = driver.findElement(By.id('session-description'));

          if (title.isDisplayed() && desc.isDisplayed()) {
            title.sendKeys('test-session');
            desc.sendKeys('description');
            driver.findElement(By.id('generate')).click();
            return true;
          } 
          assert.fail('Failed to create a new session');
          return false;
        }, shortTimeout);

        // save session information
        await driver.wait(async function() {
          const sessionID = driver.findElement(By.id('sessionID'));
          const password = driver.findElement(By.id('passwordID'));

          if (sessionID.isDisplayed() && password.isDisplayed()) {
            await sessionID.getText().then(function(text) {
              sessionKey = text;
            });

            await password.getText().then(function(text) {
              sessionPassword = text;
            });

            if (sessionKey.length === 26 && sessionPassword.length === 26) {
            console.log('Session key: ' + sessionKey);
            console.log('Session pass: ' + sessionPassword);
            return true;
            }
          }
        }, shortTimeout);

        expect(sessionKey.length).to.equal(26);
        expect(sessionPassword.length).to.equal(26);

        await driver.wait(async function() {
          return driver.findElement(By.id('link-id')).isDisplayed();
        }, shortTimeout);
      });
    } catch (e) {
      handleFailure(e, driver);
    }
  }

  async function generateParticipantLinks(driver, cohort) {
    try {
      await driver.get('localhost:8080/manage').then(async function () {
        
        // login
        await driver.wait(async function() {
          const key = driver.findElement(By.id('session'));
          const pw = driver.findElement(By.id('password'));
          if (key.isDisplayed() && pw.isDisplayed()) {
            key.sendKeys(sessionKey);
            pw.sendKeys(sessionPassword);
            await driver.findElement(By.id('login')).click();
            return true;
          }
          assert.fail('Failed to log into analyst page')
          return false;
        }, shortTimeout);


        await driver.wait(function() {
          return driver.findElement(By.id('session-start')).isDisplayed();
        }, longTimeout);
        //start session
        await driver.findElement(By.id('session-start'))
          .then((startButton) => startButton.click()); 
    
        await driver.wait(async function() {
          const submitLink = driver.findElement(By.id('participants-submit-' + cohort));
          const linkCount = driver.findElement(By.id('participants-count-' + cohort));
          if (submitLink.isDisplayed() && linkCount.isDisplayed()) {
            linkCount.sendKeys((numberOfParticipants * numberOfCohorts).toString());
            driver.findElement(By.id('participants-submit-' + cohort)).click();
            return true;
          }
        }, longTimeout);

        await driver.wait(function () {
          return driver.findElement(By.id('participants-new-' + cohort)).isDisplayed();
        }, longTimeout);

        await driver.findElement(By.id('participants-new-' + cohort))
        .then((participants) => participants.getText().then(function (text) {
          var participants = text.trim().split('\n');
          for (var i = 0; i < participants.length; i++) {
            participants[i] = participants[i].trim();
            participant_links.push(participants[i]);
          }
          expect(participant_links.length).to.equal(numberOfParticipants * numberOfCohorts);
          console.log('Number of links: ', participant_links.length);
          console.log(participant_links);
        }));

        await driver.findElement(By.id('session-status'))
        .then((status) => status.getText().then(function(t) {
          if (t !== '') {
              expect(t).to.equal('STARTED');
              return true;
          }
        }));
      });
    } catch (e) {
      handleFailure(e, driver);
    }
  }


  async function dataSubmission(driver) {
    try {  
      for (var i = 0; i < participant_links.length; i++){
        await driver.get(participant_links[i])
          .then(async function () {
          await driver.wait(async function() {
            return await driver.findElement(By.id('participation-code-success')).isDisplayed();
          }, shortTimeout);

          var cohort = Math.floor(i/numberOfCohorts);

          await driver.wait(async function() {
            var cohorts = await driver.findElement(By.id('cohortDrop'))
            if (cohorts.isDisplayed()) {
              cohorts.click();
              cohorts.findElement(By.css("option[value='" + cohort + "']")).click();
              return true;
            }
            return false;
          }, shortTimeout);

          var fileUpload = await driver.findElement(By.id('choose-file'));
          var filePath = process.cwd() + '/test/selenium/files/bwwc.xlsx';
          fileUpload.sendKeys(filePath);
          driver.sleep(10000)

          //wait for upload success
          await driver.wait(async function() {
            var ok = await driver.findElements(By.className('ajs-ok'));
            if (ok.length > 0) {
              ok[0].click();
              return true;
            }
          }, longTimeout);

          await driver.wait(async function () {
            var verify = await driver.findElement(By.id('verify'));
            var submit = await driver.findElement(By.id('submit'));
            if (verify.isEnabled()) {
              // await driver.sleep(shortTimeout);
              // verify.click();
              // await driver.sleep(shortTimeout);
              // submit.click();

              var checked = await verify.isSelected();
              console.log('checked', checked);
              var enabled = await submit.isEnabled();
              if (checked && enabled) {
                submit.click();
                // submit.click();
                // submit.click();
 
                return true;
              } else {
                verify.click();
              }
            }
          }, longTimeout);


          await driver.wait(async function() {
            var ok = await driver.findElements(By.id('submission-success'));
            if (ok.length > 0) {
              return true;
            }
          }, longTimeout);
        });
      }
    } catch (err) {
      handleFailure(err, driver);
    }
  }
   
  
 
  async function closeSession(driver) {
    try {
      //switch back to manage page
      await driver.get('localhost:8080/manage').then(async function() {
        await driver.wait(async function () {
          var session = driver.findElement(By.id('session'));
          var password = driver.findElement(By.id('password'));
          if (session.isDisplayed() && password.isDisplayed()) {
            session.sendKeys(sessionKey);
            password.sendKeys(sessionPassword);
            driver.findElement(By.id('login')).click();
            return true;
          }
        }, shortTimeout);

        await driver.wait(async function () {
          var sessionStop = await driver.findElement(By.id('session-stop'));
        
          if (sessionStop.isEnabled()) {
            sessionStop.click();
            return true;
          }
        }, longTimeout);

        await driver.wait(async function () {
          var confirm = await driver.findElement(By.id('session-close-confirm'));
        
          if (confirm.isEnabled()) {
            confirm.click();
            return true;
          }
        }, longTimeout);

        await driver.findElement(By.id('session-status'))
          .then((status) => status.getText().then(function(t) {
            if (t !== '') {
                expect(t).to.equal('STOPPED');
                return true;
            }
          }));
        });

        for (var i = 0; i < numberOfCohorts; i++) {
          await driver.wait(async function () {
            const history = await driver.findElements(By.xpath('// *[@id="table-'+ i +'"]/tbody/tr'));
            if (history.length > 0) {
              expect(history.length).to.equal(numberOfParticipants);
              return true;
            }
          }, shortTimeout);
        }

        // unmask
        // click link to unmask page
      // });

    } catch (err) {
      handleFailure(err, driver);
    }
  }

  async function unmaskData(driver) {
    try {

      driver.findElement(By.id('session'))
        .then((key) =>  key.sendKeys(sessionKey) )
        .then(() => driver.findElement(By.id('session-password')) )
        .then((password) => password.sendKeys(sessionPassword) )
      await driver.sleep(500);
      var fileUpload = await driver.findElement(By.id('choose-file'));
      var filePath = getUserHome() + '/Downloads/' + 'Session_' + sessionKey + '_private_key.pem'
      fileUpload.sendKeys(filePath);
  
  
      var tableValues;
      await driver.wait(async function () {
        tableValues = await driver.findElements(By.xpath('//td[@class="htDimmed"]'));
        return (tableValues.length > 0);
      }, 180000);
  
      // check values
      for (var i = 0; i < tableValues.length; i++) {
        var value = await tableValues[i].getText();
        if (!isNaN(parseInt(value))) {
          expect(parseInt(value)).to.equal(dataValue * numberOfParticipants);
        }
      }
    } catch (err) {
      handleFailure(err, driver);
    }
  }
});