function(instance, properties, context) {
  instance.data.heightmyvideo = properties.heightmyvideo;
  instance.data.widthmyvideo = properties.widthmyvideo;
  instance.data.heightopvideo = properties.heightopvideo;
  instance.data.widthopvideo = properties.widthopvideo;

  if(instance.data.widthmyvideo) {
    instance.data.videoLeft = $('<video></video>');
    instance.data.videoLeft.attr('autoplay', true);
    instance.data.videoLeft.attr('controls', true);
    instance.data.videoLeft.width(instance.data.widthmyvideo + 'px');
    instance.data.videoLeft.height(instance.data.heightmyvideo + 'px');
    instance.data.videoLeft.css('position', 'absolute');
    instance.data.videoLeft.css('left', properties.xmyvideo + 'px');
    instance.data.videoLeft.css('top', properties.ymyvideo + 'px');
    instance.data.videoLeft.css('z-index', 10);
    instance.canvas.append(instance.data.videoLeft);
  }

  instance.data.videoRight = $('<video></video>');
  instance.data.videoRight.attr('autoplay', true);
  instance.data.videoRight.attr('controls', true);
  if(instance.data.widthopvideo) {
    instance.data.videoRight.width(instance.data.widthopvideo + 'px');
    instance.data.videoRight.height(instance.data.heightopvideo + 'px');
    instance.data.videoRight.css('left', properties.xopvideo + 'px');
    instance.data.videoRight.css('top', properties.yopvideo + 'px');
    if(properties.topopvideo) {
      instance.data.videoRight.css('z-index', properties.topopvideo);
    }
  }
  instance.canvas.append(instance.data.videoRight);
  
  console.log(instance.data.videoRight);
}